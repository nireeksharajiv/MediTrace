
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const QUEUE_FILE = path.join(DATA_DIR, "pending-events.json");

const CONTRACT_ADDRESS =
  "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

const CONTRACT_NAME = "contracts/MediTrace.sol:MediTrace";

type PendingEvent = {
  eventId: string;
  eventType: string;
  gtin: string;
  serialNumber: string;
  batchNumber: string;
  manufacturer: string;
  distributor: string;
  nonce: string | number;
  receiptTimestamp: number;
  chainId: number;
  contractAddress: string;
  status: string;
  createdAt: string;
  transactionHash?: string;
  blockNumber?: number;
  confirmedAt?: string;
  lastError?: string;
};

function loadEvents(): PendingEvent[] {
  if (!fs.existsSync(QUEUE_FILE)) {
    throw new Error(
      "Pending events file not found. Run record-offline-receipt.ts first."
    );
  }

  const content = fs.readFileSync(QUEUE_FILE, "utf8");
  return JSON.parse(content) as PendingEvent[];
}

function saveEvents(events: PendingEvent[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const tempFile = `${QUEUE_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(events, null, 2),
    "utf8"
  );

  fs.renameSync(tempFile, QUEUE_FILE);
}

async function main() {
  console.log("\n===== MEDiTRACE OFFLINE EVENT SYNCHRONIZATION =====");

  // Connect to the local Hardhat network
  const { viem } = await network.connect();

  const wallets = await viem.getWalletClients();
  const distributor = wallets[2];

  if (!distributor) {
    throw new Error("Distributor wallet is not available.");
  }

  const publicClient = await viem.getPublicClient();

  console.log("Distributor:", distributor.account.address);
  console.log("Contract:", CONTRACT_ADDRESS);

  // Load pending events
  const events = loadEvents();

  const pendingEvents = events.filter(
    (event) =>
      event.status === "PENDING_SYNC" ||
      event.status === "SYNCING"
  );

  if (pendingEvents.length === 0) {
    console.log("\nNo pending events available for synchronization.");
    return;
  }

  console.log("\nPending events found:", pendingEvents.length);

  // Process each pending event
  for (const event of pendingEvents) {
    console.log("\n----------------------------------------");
    console.log("Medicine Serial:", event.serialNumber);
    console.log("Event ID:", event.eventId);

    try {
      // Validate blockchain network and contract
      const chainId = await publicClient.getChainId();

      if (Number(event.chainId) !== chainId) {
        throw new Error("Network chain ID mismatch.");
      }

      if (
        event.contractAddress.toLowerCase() !==
        CONTRACT_ADDRESS.toLowerCase()
      ) {
        throw new Error("Contract address mismatch.");
      }

      // Validate distributor
      if (
        event.distributor.toLowerCase() !==
        distributor.account.address.toLowerCase()
      ) {
        throw new Error("Distributor address mismatch.");
      }

      // Connect to MediTrace contract
      const contract = await viem.getContractAt(
        CONTRACT_NAME,
        event.contractAddress as `0x${string}`,
        {
          client: { wallet: distributor },
        }
      );

      console.log("Checking on-chain medicine status...");

      // Read medicine details from blockchain
      const medicine = await contract.read.getMedicine([
        event.gtin,
        event.serialNumber,
      ]);

      const currentStatus = Number(medicine.status);

      console.log("Current blockchain status:", currentStatus);

      // Status 3 = Received
      // The event may already have been confirmed on-chain.
      if (currentStatus === 3) {
        if (
          medicine.dispatchedTo.toLowerCase() !==
          distributor.account.address.toLowerCase()
        ) {
          event.status = "REJECTED";
          event.lastError =
            "Medicine was received by a different distributor.";

          saveEvents(events);
          console.log("REJECTED: Different receiving distributor.");
          continue;
        }

        event.status = "CONFIRMED";
        event.confirmedAt = new Date().toISOString();
        delete event.lastError;

        saveEvents(events);

        console.log("Already received on-chain.");
        console.log("Event marked as CONFIRMED.");
        continue;
      }

      // Status 2 = Dispatched
      if (currentStatus !== 2) {
        event.status = "REJECTED";
        event.lastError =
          `Invalid medicine status. Expected Dispatched (2), got ${currentStatus}.`;

        saveEvents(events);

        console.log("REJECTED:", event.lastError);
        continue;
      }

      // Ensure medicine was dispatched to this distributor
      if (
        medicine.dispatchedTo.toLowerCase() !==
        distributor.account.address.toLowerCase()
      ) {
        event.status = "REJECTED";
        event.lastError =
          "Medicine was not dispatched to this distributor.";

        saveEvents(events);

        console.log("REJECTED:", event.lastError);
        continue;
      }

      // Submit the receipt transaction
      console.log("Submitting receipt to blockchain...");

      event.status = "SYNCING";
      saveEvents(events);

      const transactionHash =
        await contract.write.receiveMedicine([
          event.gtin,
          event.serialNumber,
        ]);

      console.log("Transaction submitted:", transactionHash);

      // Wait for blockchain confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
      });

      if (receipt.status !== "success") {
        throw new Error("Blockchain transaction failed.");
      }

      // Verify the final state
      const updatedMedicine = await contract.read.getMedicine([
        event.gtin,
        event.serialNumber,
      ]);

      if (Number(updatedMedicine.status) !== 3) {
        throw new Error(
          "Transaction completed, but medicine status is not Received."
        );
      }

      if (
        updatedMedicine.dispatchedTo.toLowerCase() !==
        distributor.account.address.toLowerCase()
      ) {
        throw new Error(
          "Final distributor verification failed."
        );
      }

      // Update local event after successful confirmation
      event.status = "CONFIRMED";
      event.transactionHash = transactionHash;
      event.blockNumber = Number(receipt.blockNumber);
      event.confirmedAt = new Date().toISOString();

      delete event.lastError;

      saveEvents(events);

      console.log("SUCCESS: Event synchronized!");
      console.log("Transaction:", transactionHash);
      console.log("Block Number:", receipt.blockNumber);
      console.log("Final Status: RECEIVED");
    } catch (error) {
      event.status = "PENDING_SYNC";

      event.lastError =
        error instanceof Error
          ? error.message
          : String(error);

      saveEvents(events);

      console.error("Synchronization failed:", event.lastError);
      console.log("Event retained for retry.");
    }
  }

  // Final summary
  console.log("\n===== SYNCHRONIZATION SUMMARY =====");

  const confirmed = events.filter(
    (event) => event.status === "CONFIRMED"
  ).length;

  const pending = events.filter(
    (event) => event.status === "PENDING_SYNC" ||
      event.status === "SYNCING"
  ).length;

  const rejected = events.filter(
    (event) => event.status === "REJECTED"
  ).length;

  console.log("Confirmed:", confirmed);
  console.log("Pending:", pending);
  console.log("Rejected:", rejected);

  console.log("\nQueue file:", QUEUE_FILE);
  console.log("====================================");
}

main().catch((error) => {
  console.error("\nSynchronization script failed:", error);
  process.exitCode = 1;
});
