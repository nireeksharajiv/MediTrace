
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  const wallets = await viem.getWalletClients();
  const manufacturer = wallets[1];

  if (!manufacturer) {
    throw new Error("Manufacturer wallet unavailable");
  }

  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const contract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress,
    { client: { wallet: manufacturer } }
  );

  const publicClient = await viem.getPublicClient();

  const gtin = "08901234567890";
  const serialNumber = "SNTEST000001";
  const batchNumber = "BATCHTEST001";
  const expiryDate = "2028-12-31";

  console.log("\n===== MEDICINE REGISTRATION TEST =====");

  console.log("Manufacturer:", manufacturer.account.address);
  console.log("GTIN:", gtin);
  console.log("Serial:", serialNumber);
  console.log("Batch:", batchNumber);
  console.log("Expiry:", expiryDate);

  // Check existence using getMedicineId and verifyMedicine.
  const medicineId = await contract.read.getMedicineId([
    gtin,
    serialNumber,
  ]);

  const exists = await contract.read.verifyMedicine([
    gtin,
    serialNumber,
  ]);

  if (exists) {
    console.log("\nMedicine already exists. Skipping registration.");
  } else {
    console.log("\nRegistering new medicine...");

    const hash = await contract.write.registerMedicine([
      gtin,
      serialNumber,
      batchNumber,
      expiryDate,
    ]);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    if (receipt.status !== "success") {
      throw new Error("Registration transaction failed");
    }

    console.log("Transaction hash:", hash);
    console.log("Block number:", receipt.blockNumber.toString());
  }

  // Read the registered medicine.
  const result = await contract.read.getMedicine([
    gtin,
    serialNumber,
  ]);

  console.log("\n===== ON-CHAIN VERIFICATION =====");
  console.log("Medicine ID:", medicineId);
  console.log("GTIN:", result.gtin);
  console.log("Serial:", result.serialNumber);
  console.log("Batch:", result.batchNumber);
  console.log("Expiry:", result.expiryDate);
  console.log("Status:", result.status.toString());
  console.log("Registered by:", result.registeredBy);

  if (Number(result.status) !== 1) {
    throw new Error("Medicine registration verification failed");
  }

  console.log("\nSUCCESS: Medicine registered and verified!");
}

main().catch((error) => {
  console.error("\nRegistration failed:", error);
  process.exitCode = 1;
});
