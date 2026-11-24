
import { network } from "hardhat";
import { recoverTypedDataAddress } from "viem";

async function main() {
  const { viem } = await network.connect();

  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();

  const manufacturer = wallets[1];

  if (!manufacturer) {
    throw new Error("Manufacturer wallet not found");
  }

  // Deployed MediTrace contract
  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const chainId = await publicClient.getChainId();

  // Authorization validity: one hour
  const currentTime = Math.floor(Date.now() / 1000);
  const expiresAt = BigInt(currentTime + 3600);

  // EIP-712 domain
  const domain = {
    name: "MediTrace",
    version: "1",
    chainId,
    verifyingContract: contractAddress as `0x${string}`,
  };

  // Structured authorization fields
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
    gtin: "08901234560013",
    serialNumber: "SN100001",
    batchNumber: "BAT2026001",
    manufacturer: manufacturer.account.address,
    distributor:
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}`,
    nonce: 1n,
    expiresAt,
  };

  console.log("\n===== MEDiTRACE SECURE AUTHORIZATION =====");

  console.log("\n1. AUTHORIZATION DETAILS");
  console.log("GTIN:", authorization.gtin);
  console.log("Serial:", authorization.serialNumber);
  console.log("Batch:", authorization.batchNumber);
  console.log("Manufacturer:", authorization.manufacturer);
  console.log("Distributor:", authorization.distributor);
  console.log("Nonce:", authorization.nonce.toString());
  console.log("Expiry:", new Date(Number(expiresAt) * 1000).toISOString());
  console.log("Chain ID:", chainId);
  console.log("Contract:", contractAddress);

  // Manufacturer signs the structured authorization
  const signature = await manufacturer.signTypedData({
    account: manufacturer.account,
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
  });

  console.log("\n2. DIGITAL SIGNATURE");
  console.log(signature);

  // Recover the signer from the signed authorization
  const recoveredAddress = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
    signature,
  });

  const isValid =
    recoveredAddress.toLowerCase() ===
    manufacturer.account.address.toLowerCase();

  console.log("\n3. SIGNATURE VERIFICATION");
  console.log("Recovered signer:", recoveredAddress);
  console.log("Signature valid:", isValid);

  if (!isValid) {
    throw new Error("Authorization signature invalid");
  }

  // Test recipient tampering
  const modifiedAuthorization = {
    ...authorization,
    distributor:
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" ===
      authorization.distributor
        ? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`
        : "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}`,
  };

  const modifiedSigner = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: modifiedAuthorization,
    signature,
  });

  const modifiedValid =
    modifiedSigner.toLowerCase() ===
    manufacturer.account.address.toLowerCase();

  console.log("\n4. RECIPIENT TAMPERING TEST");
  console.log("Original distributor:", authorization.distributor);
  console.log("Modified distributor:", modifiedAuthorization.distributor);
  console.log("Modified authorization valid:", modifiedValid);

  if (modifiedValid) {
    throw new Error("Tampered authorization was accepted");
  }

  // Check expiry locally
  const isExpired = BigInt(Math.floor(Date.now() / 1000)) > expiresAt;

  console.log("\n5. EXPIRY CHECK");
  console.log("Authorization expired:", isExpired);

  console.log("\nSUCCESS: Structured authorization signed and verified!");
  console.log("Recipient modification correctly rejected.");
}

main().catch((error) => {
  console.error("\nAuthorization test failed:", error);
  process.exitCode = 1;
});
