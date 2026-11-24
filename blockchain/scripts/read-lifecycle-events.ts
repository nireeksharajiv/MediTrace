
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  const contractAddress =
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

  const publicClient = await viem.getPublicClient();

  const latestBlock = await publicClient.getBlockNumber();

  // Connect to MediTrace contract
  const contract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress
  );

  // Retrieve registration events
  const registered = await publicClient.getContractEvents({
    address: contractAddress,
    abi: contract.abi,
    eventName: "MedicineRegistered",
    fromBlock: 0n,
    toBlock: latestBlock,
  });

  // Retrieve dispatch events
  const dispatched = await publicClient.getContractEvents({
    address: contractAddress,
    abi: contract.abi,
    eventName: "MedicineDispatched",
    fromBlock: 0n,
    toBlock: latestBlock,
  });

  // Retrieve receipt events
  const received = await publicClient.getContractEvents({
    address: contractAddress,
    abi: contract.abi,
    eventName: "MedicineReceived",
    fromBlock: 0n,
    toBlock: latestBlock,
  });

  // Prepare readable history
  const history = [
    ...registered.map((event) => ({
      action: "MEDICINE REGISTERED",
      block: event.blockNumber,
      transaction: event.transactionHash,
      details: [
        `GTIN: ${event.args.gtin}`,
        `Serial Number: ${event.args.serialNumber}`,
        `Manufacturer: ${event.args.manufacturer}`,
      ],
    })),

    ...dispatched.map((event) => ({
      action: "MEDICINE DISPATCHED",
      block: event.blockNumber,
      transaction: event.transactionHash,
      details: [
        `Medicine ID: ${event.args.medicineId}`,
        `Manufacturer: ${event.args.manufacturer}`,
        `Distributor: ${event.args.distributor}`,
      ],
    })),

    ...received.map((event) => ({
      action: "MEDICINE RECEIVED",
      block: event.blockNumber,
      transaction: event.transactionHash,
      details: [
        `Medicine ID: ${event.args.medicineId}`,
        `Distributor: ${event.args.distributor}`,
      ],
    })),
  ];

  // Sort events by block number
  history.sort((a, b) =>
    Number(a.block - b.block)
  );

  console.log("\n========================================");
  console.log("       MEDiTRACE MEDICINE HISTORY");
  console.log("========================================");

  if (history.length === 0) {
    console.log("\nNo lifecycle events found.");
    return;
  }

  history.forEach((event, index) => {
    console.log(`\n${index + 1}. ${event.action}`);
    console.log("----------------------------------------");

    console.log("Block Number:", event.block);

    event.details.forEach((detail) => {
      console.log(detail);
    });

    console.log("Transaction Hash:", event.transaction);
  });

  console.log("\n========================================");
  console.log("       END OF MEDICINE HISTORY");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nHistory retrieval failed:", error);
  process.exitCode = 1;
});
