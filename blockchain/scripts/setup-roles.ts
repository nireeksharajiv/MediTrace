
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  const wallets = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const admin = wallets[0];
  const manufacturer = wallets[1];
  const distributor = wallets[2];

  if (!admin || !manufacturer || !distributor) {
    throw new Error("Required Hardhat accounts are missing");
  }

  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const contract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress
  );

  console.log("\n===== MEDiTRACE ROLE SETUP =====");

  console.log("Admin:", admin.account.address);
  console.log("Manufacturer:", manufacturer.account.address);
  console.log("Distributor:", distributor.account.address);
  console.log("Contract:", contractAddress);

  const currentAdmin = await contract.read.admin();

  if (
    currentAdmin.toLowerCase() !==
    admin.account.address.toLowerCase()
  ) {
    throw new Error("Connected account is not the contract admin");
  }

  // Authorize manufacturer if not already authorized
  const manufacturerAuthorized =
    await contract.read.manufacturers([
      manufacturer.account.address,
    ]);

  if (!manufacturerAuthorized) {
    const hash = await contract.write.authorizeManufacturer(
      [manufacturer.account.address],
      { account: admin.account }
    );

    await publicClient.waitForTransactionReceipt({ hash });

    console.log("Manufacturer authorization: SUCCESS");
  } else {
    console.log("Manufacturer already authorized");
  }

  // Authorize distributor if not already authorized
  const distributorAuthorized =
    await contract.read.distributors([
      distributor.account.address,
    ]);

  if (!distributorAuthorized) {
    const hash = await contract.write.authorizeDistributor(
      [distributor.account.address],
      { account: admin.account }
    );

    await publicClient.waitForTransactionReceipt({ hash });

    console.log("Distributor authorization: SUCCESS");
  } else {
    console.log("Distributor already authorized");
  }

  // Verify permissions
  const verifyManufacturer =
    await contract.read.manufacturers([
      manufacturer.account.address,
    ]);

  const verifyDistributor =
    await contract.read.distributors([
      distributor.account.address,
    ]);

  console.log("\n===== PERMISSION VERIFICATION =====");
  console.log("Manufacturer authorized:", verifyManufacturer);
  console.log("Distributor authorized:", verifyDistributor);

  if (!verifyManufacturer || !verifyDistributor) {
    throw new Error("Role verification failed");
  }

  console.log("\nSUCCESS: MediTrace roles restored!");
}

main().catch((error) => {
  console.error("\nRole setup failed:", error);
  process.exitCode = 1;
});
