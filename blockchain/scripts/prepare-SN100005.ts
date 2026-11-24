
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  console.log("\n===== MEDiTRACE SN100005 PREPARATION =====");

  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();

  const admin = wallets[0];
  const manufacturer = wallets[1];
  const distributor = wallets[2];

  if (!admin || !manufacturer || !distributor) {
    throw new Error("Required Hardhat wallets are unavailable.");
  }

  const contractAddress =
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

  const contractName = "contracts/MediTrace.sol:MediTrace";

  const packetPath = path.join(
    process.cwd(),
    "packets",
    "authorization-SN100005.json"
  );

  if (!fs.existsSync(packetPath)) {
    throw new Error("Authorization packet not found.");
  }

  const packet = JSON.parse(
    fs.readFileSync(packetPath, "utf8")
  );

  const authorization = {
    gtin: packet.authorization.gtin,
    serialNumber: packet.authorization.serialNumber,
    batchNumber: packet.authorization.batchNumber,
    manufacturer: packet.authorization.manufacturer as `0x${string}`,
    distributor: packet.authorization.distributor as `0x${string}`,
    nonce: BigInt(packet.authorization.nonce),
    expiresAt: BigInt(packet.authorization.expiresAt),
  };

  const signature = packet.signature as `0x${string}`;

  const publicClient = await viem.getPublicClient();

  console.log("Medicine:", authorization.serialNumber);
  console.log("GTIN:", authorization.gtin);
  console.log("Nonce:", authorization.nonce.toString());

  // Check that the packet belongs to this deployment.
  const chainId = await publicClient.getChainId();

  if (chainId !== Number(packet.domain.chainId)) {
    throw new Error("Chain ID does not match the authorization packet.");
  }

  if (
    packet.domain.verifyingContract.toLowerCase() !==
    contractAddress.toLowerCase()
  ) {
    throw new Error("Contract address does not match the packet.");
  }

  if (
    authorization.manufacturer.toLowerCase() !==
    manufacturer.account.address.toLowerCase()
  ) {
    throw new Error("Manufacturer wallet does not match the packet.");
  }

  if (
    authorization.distributor.toLowerCase() !==
    distributor.account.address.toLowerCase()
  ) {
    throw new Error("Distributor wallet does not match the packet.");
  }

  if (authorization.expiresAt < BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error("Authorization packet has expired.");
  }

  // Connect admin, manufacturer and distributor.
  const adminContract = await viem.getContractAt(
    contractName,
    contractAddress,
    { client: { wallet: admin } }
  );

  const manufacturerContract = await viem.getContractAt(
    contractName,
    contractAddress,
    { client: { wallet: manufacturer } }
  );

  const distributorContract = await viem.getContractAt(
    contractName,
    contractAddress,
    { client: { wallet: distributor } }
  );

  // Ensure manufacturer is authorized.
  const manufacturerAuthorized =
    await adminContract.read.manufacturers([
      manufacturer.account.address,
    ]);

  if (!manufacturerAuthorized) {
    console.log("\nAuthorizing manufacturer...");

    await adminContract.write.authorizeManufacturer([
      manufacturer.account.address,
    ]);

    console.log("Manufacturer authorized.");
  } else {
    console.log("\nManufacturer already authorized.");
  }

  // Ensure distributor is authorized.
  const distributorAuthorized =
    await adminContract.read.distributors([
      distributor.account.address,
    ]);

  if (!distributorAuthorized) {
    console.log("Authorizing distributor...");

    await adminContract.write.authorizeDistributor([
      distributor.account.address,
    ]);

    console.log("Distributor authorized.");
  } else {
    console.log("Distributor already authorized.");
  }

  // Check whether the medicine is already registered.
  let medicineExists = false;

  try {
    await adminContract.read.getMedicine([
      authorization.gtin,
      authorization.serialNumber,
    ]);

    medicineExists = true;
  } catch {
    medicineExists = false;
  }

  if (!medicineExists) {
    console.log("\nRegistering medicine...");

    await manufacturerContract.write.registerMedicine([
      authorization.gtin,
      authorization.serialNumber,
      authorization.batchNumber,
      "2028-01-14",
    ]);

    console.log("Medicine registered.");
  } else {
    console.log("\nMedicine is already registered.");
  }

  // Read the current medicine state.
  const medicine = await adminContract.read.getMedicine([
    authorization.gtin,
    authorization.serialNumber,
  ]);

  const status = Number(medicine.status);

  console.log("Current status:", status);

  if (
    medicine.registeredBy.toLowerCase() !==
    authorization.manufacturer.toLowerCase()
  ) {
    throw new Error("Medicine was registered by a different manufacturer.");
  }

  if (medicine.batchNumber !== authorization.batchNumber) {
    throw new Error("Medicine batch number does not match the packet.");
  }

  // Dispatch using the manufacturer's EIP-712 authorization.
  if (status === 1) {
    console.log("\nSubmitting signed dispatch authorization...");

    const transactionHash =
      await distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]);

    console.log("Dispatch transaction:", transactionHash);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });

    if (receipt.status !== "success") {
      throw new Error("Dispatch transaction failed.");
    }

    console.log("Dispatch transaction confirmed.");
  } else if (status === 2) {
    console.log("\nMedicine is already dispatched.");

    if (
      medicine.dispatchedTo.toLowerCase() !==
      authorization.distributor.toLowerCase()
    ) {
      throw new Error("Medicine was dispatched to another distributor.");
    }
  } else if (status === 3) {
    throw new Error(
      "Medicine is already received. No dispatch is required."
    );
  } else {
    throw new Error(`Unexpected medicine status: ${status}`);
  }

  // Verify final dispatch state.
  const finalMedicine = await adminContract.read.getMedicine([
    authorization.gtin,
    authorization.serialNumber,
  ]);

  if (
    Number(finalMedicine.status) !== 2 ||
    finalMedicine.dispatchedTo.toLowerCase() !==
      authorization.distributor.toLowerCase()
  ) {
    throw new Error("Final dispatch verification failed.");
  }

  console.log("\n===== PREPARATION SUCCESSFUL =====");
  console.log("Serial Number:", finalMedicine.serialNumber);
  console.log("Batch Number:", finalMedicine.batchNumber);
  console.log("Status: DISPATCHED (2)");
  console.log("Dispatched To:", finalMedicine.dispatchedTo);
  console.log("Nonce:", authorization.nonce.toString());
  console.log("Signed authorization used successfully.");
}

main().catch((error) => {
  console.error("\nPreparation failed:", error);
  process.exitCode = 1;
});
