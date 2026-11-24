
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  // Updated MediTrace contract address
  const contractAddress =
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

  // Get admin, manufacturer and distributor wallets
  const [admin, manufacturer, distributor] =
    await viem.getWalletClients();

  if (!admin || !manufacturer || !distributor) {
    throw new Error("Required wallet accounts not available");
  }

  console.log("\n===== MEDiTRACE LIFECYCLE TEST =====");

  console.log("Admin:", admin.account.address);
  console.log("Manufacturer:", manufacturer.account.address);
  console.log("Distributor:", distributor.account.address);

  // Connect as admin
  const adminContract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress,
    { client: { wallet: admin } }
  );

  // 1. Authorize manufacturer
  console.log("\n1. Authorizing manufacturer...");

  const tx1 = await adminContract.write.authorizeManufacturer([
    manufacturer.account.address,
  ]);

  console.log("Manufacturer authorized:", tx1);

  // 2. Authorize distributor
  console.log("\n2. Authorize distributor...");

  const tx2 = await adminContract.write.authorizeDistributor([
    distributor.account.address,
  ]);

  console.log("Distributor authorized:", tx2);

  // Connect as manufacturer
  const manufacturerContract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress,
    { client: { wallet: manufacturer } }
  );

  // Medicine sample details
  const gtin = "08901234560013";
  const serial = "SN100001";
  const batch = "BAT2026001";
  const expiry = "2028-01-14";

  // 3. Register medicine
  console.log("\n3. Registering medicine...");

  const tx3 = await manufacturerContract.write.registerMedicine([
    gtin,
    serial,
    batch,
    expiry,
  ]);

  console.log("Medicine registered:", tx3);

  // 4. Dispatch medicine using existing online method
  console.log("\n4. Dispatching medicine...");

  const tx4 = await manufacturerContract.write.dispatchMedicine([
    gtin,
    serial,
    distributor.account.address,
  ]);

  console.log("Medicine dispatched:", tx4);

  // Connect as distributor
  const distributorContract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress,
    { client: { wallet: distributor } }
  );

  // 5. Distributor receives medicine
  console.log("\n5. Distributor receiving medicine...");

  const tx5 = await distributorContract.write.receiveMedicine([
    gtin,
    serial,
  ]);

  console.log("Medicine received:", tx5);

  // 6. Verify final medicine record
  console.log("\n6. Verifying final medicine record...");

  const medicine = await adminContract.read.getMedicine([
    gtin,
    serial,
  ]);

  console.log("\n===== FINAL MEDICINE DETAILS =====");

  console.log("GTIN:", medicine.gtin);
  console.log("Serial Number:", medicine.serialNumber);
  console.log("Batch Number:", medicine.batchNumber);
  console.log("Expiry Date:", medicine.expiryDate);
  console.log("Status:", medicine.status);
  console.log("Registered By:", medicine.registeredBy);
  console.log("Dispatched To:", medicine.dispatchedTo);

  if (medicine.status !== 3) {
    throw new Error("Medicine did not reach Received status");
  }

  console.log("\nSUCCESS: Complete medicine lifecycle verified!");
}

main().catch((error) => {
  console.error("\nLifecycle test failed:", error);
  process.exitCode = 1;
});
