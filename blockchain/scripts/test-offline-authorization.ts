
import {
  recoverTypedDataAddress,
  type Address,
} from "viem";

import { network } from "hardhat";

async function main() {
  console.log("\n===== MEDiTRACE OFFLINE AUTHORIZATION TEST =====");

  // Connect to Hardhat only once to obtain test wallets
  // and the chain ID used when signing.
  const { viem } = await network.connect();

  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const wallets = await viem.getWalletClients();

  const manufacturer = wallets[1];
  const distributor = wallets[2];

  if (!manufacturer || !distributor) {
    throw new Error("Required test wallets unavailable");
  }

  const contractAddress =
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9" as Address;

  const gtin = "08901234560013";
  const serialNumber = "SN100004";
  const batchNumber = "BAT2026001";
  const nonce = 1004n;

  const expiresAt = BigInt(
    Math.floor(Date.now() / 1000) + 3600
  );

  // EIP-712 domain
  const domain = {
    name: "MediTrace",
    version: "1",
    chainId,
    verifyingContract: contractAddress,
  };

  // Must match the Solidity TransferAuthorization structure
  const types = {
    TransferAuthorization: [
      { name: "gtin", type: "string" },
      { name: "serialNumber", type: "string" },
      { name: "batchNumber", type: "string" },
      { name: "manufacturer", type: "address" },
      { name: "distributor", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
    ],
  } as const;

  const authorization = {
    gtin,
    serialNumber,
    batchNumber,
    manufacturer: manufacturer.account.address,
    distributor: distributor.account.address,
    nonce,
    expiresAt,
  };

  // =====================================
  // 1. MANUFACTURER SIGNS AUTHORIZATION
  // =====================================

  console.log("\n1. MANUFACTURER SIGNS AUTHORIZATION");

  const signature = await manufacturer.signTypedData({
    account: manufacturer.account,
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
  });

  console.log("Signature generated successfully");

  // =====================================
  // 2. VERIFY MANUFACTURER SIGNATURE
  // =====================================

  console.log("\n2. VERIFYING MANUFACTURER SIGNATURE");

  const recoveredAddress = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
    signature,
  });

  console.log("Expected:", authorization.manufacturer);
  console.log("Recovered:", recoveredAddress);

  if (
    recoveredAddress.toLowerCase() !==
    authorization.manufacturer.toLowerCase()
  ) {
    throw new Error("Invalid manufacturer signature");
  }

  console.log("Manufacturer signature: VALID");

  // =====================================
  // 3. VERIFY DISTRIBUTOR
  // =====================================

  console.log("\n3. VERIFYING INTENDED DISTRIBUTOR");

  if (
    authorization.distributor.toLowerCase() !==
    distributor.account.address.toLowerCase()
  ) {
    throw new Error("Wrong distributor");
  }

  console.log("Distributor verification: SUCCESS");

  // =====================================
  // 4. VERIFY EXPIRY
  // =====================================

  console.log("\n4. VERIFYING AUTHORIZATION EXPIRY");

  const currentTime = BigInt(
    Math.floor(Date.now() / 1000)
  );

  if (authorization.expiresAt < currentTime) {
    throw new Error("Authorization expired");
  }

  console.log("Expiry verification: SUCCESS");

  // =====================================
  // 5. SIMULATE LOCAL NONCE CHECK
  // =====================================

  console.log("\n5. TESTING LOCAL NONCE PROTECTION");

  // Demonstration only: this set exists only in memory.
  // It must later be replaced with persistent secure storage.

  const usedNonces = new Set<string>();

  const nonceKey =
    `${authorization.manufacturer.toLowerCase()}:${nonce}`;

  if (usedNonces.has(nonceKey)) {
    throw new Error("Authorization already used");
  }

  usedNonces.add(nonceKey);

  console.log("Nonce:", nonce.toString());
  console.log("Nonce accepted locally");

  // Test reuse
  if (usedNonces.has(nonceKey)) {
    console.log("Duplicate nonce correctly detected locally");
  } else {
    throw new Error("Duplicate nonce was not detected");
  }

  // =====================================
  // 6. FINAL RESULTS
  // =====================================

  console.log("\n===== FINAL OFFLINE TEST RESULTS =====");

  console.log("Signature verification: SUCCESS");
  console.log("Distributor verification: SUCCESS");
  console.log("Expiry validation: SUCCESS");
  console.log("Local nonce validation: SUCCESS");
  console.log("Duplicate nonce detection: SUCCESS");

  console.log(
    "\nSUCCESS: Offline authorization verification completed!"
  );

  console.log(
    "\nNOTE: This is a local simulation. " +
    "The nonce set is temporary and does not establish " +
    "global authorization freshness."
  );
}

main().catch((error) => {
  console.error("\nOffline authorization test failed:", error);
  process.exitCode = 1;
});
