
import { network } from "hardhat";
import { recoverMessageAddress } from "viem";

async function main() {
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();

  const manufacturer = wallets[1];

  if (!manufacturer) {
    throw new Error("Manufacturer wallet not found");
  }

  const authorization = {
    action: "TRANSFER",
    gtin: "08901234560013",
    serialNumber: "SN100001",
    batchNumber: "BAT2026001",
    expiryDate: "2028-01-14",
    distributor: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  };

  const originalMessage = JSON.stringify(authorization);

  // Manufacturer signs the original authorization
  const signature = await manufacturer.signMessage({
    account: manufacturer.account,
    message: originalMessage,
  });

  // Verify original authorization
  const originalSigner = await recoverMessageAddress({
    message: originalMessage,
    signature,
  });

  const originalValid =
    originalSigner.toLowerCase() ===
    manufacturer.account.address.toLowerCase();

  console.log("\n===== MEDiTRACE TAMPER TEST =====");

  console.log("\n1. ORIGINAL AUTHORIZATION");
  console.log("Serial Number:", authorization.serialNumber);
  console.log("Signature valid:", originalValid);

  // Someone modifies the serial number
  const tamperedAuthorization = {
    ...authorization,
    serialNumber: "SN100002",
  };

  const tamperedMessage = JSON.stringify(tamperedAuthorization);

  // Verify modified authorization using original signature
  const tamperedSigner = await recoverMessageAddress({
    message: tamperedMessage,
    signature,
  });

  const tamperedValid =
    tamperedSigner.toLowerCase() ===
    manufacturer.account.address.toLowerCase();

  console.log("\n2. TAMPERED AUTHORIZATION");
  console.log("Modified Serial:", tamperedAuthorization.serialNumber);
  console.log("Recovered signer:", tamperedSigner);
  console.log("Signature valid:", tamperedValid);

  console.log("\n3. FINAL RESULT");

  if (originalValid && !tamperedValid) {
    console.log("SUCCESS: Modified authorization rejected!");
  } else {
    throw new Error("Tamper detection test failed");
  }
}

main().catch((error) => {
  console.error("Tamper test failed:", error);
  process.exitCode = 1;
});
