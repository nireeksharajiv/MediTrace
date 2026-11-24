
import { network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  console.log("\n===== MEDiTRACE AUTHORIZATION PACKET GENERATOR =====");

  // Connect to local Hardhat network
  const { viem } = await network.connect();

  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const wallets = await viem.getWalletClients();

  const manufacturer = wallets[1];
  const distributor = wallets[2];

  if (!manufacturer || !distributor) {
    throw new Error("Manufacturer or distributor wallet unavailable");
  }

  // Contract details
  const contractAddress =
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

  // Medicine details
  const gtin = "08901234560013";
  const serialNumber = "SN100005";
  const batchNumber = "BAT2026001";

  // Authorization details
  const nonce = 1005n;

  const expiresAt = BigInt(
    Math.floor(Date.now() / 1000) + 3600
  );

  // EIP-712 domain
  const domain = {
    name: "MediTrace",
    version: "1",
    chainId,
    verifyingContract: contractAddress as `0x${string}`,
  };

  // Must match the Solidity contract
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

  // Manufacturer signs the authorization
  console.log("\n1. GENERATING MANUFACTURER SIGNATURE");

  const signature = await manufacturer.signTypedData({
    account: manufacturer.account,
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
  });

  console.log("Signature generated successfully");

  // Create portable JSON packet
  const packet = {
    packetVersion: "1.0",
    protocol: "MediTrace-EIP712",

    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },

    authorization: {
      gtin: authorization.gtin,
      serialNumber: authorization.serialNumber,
      batchNumber: authorization.batchNumber,
      manufacturer: authorization.manufacturer,
      distributor: authorization.distributor,
      nonce: authorization.nonce.toString(),
      expiresAt: authorization.expiresAt.toString(),
    },

    signature,

    createdAt: new Date().toISOString(),
  };

  // Save packet
  const outputDirectory = join(process.cwd(), "packets");

  await mkdir(outputDirectory, { recursive: true });

  const filePath = join(
    outputDirectory,
    `authorization-${serialNumber}.json`
  );

  await writeFile(
    filePath,
    JSON.stringify(packet, null, 2),
    "utf8"
  );

  console.log("\n2. AUTHORIZATION PACKET CREATED");

  console.log("Medicine Serial:", serialNumber);
  console.log("Manufacturer:", authorization.manufacturer);
  console.log("Distributor:", authorization.distributor);
  console.log("Nonce:", nonce.toString());
  console.log("Expiry:", expiresAt.toString());

  console.log("\nPacket saved at:");
  console.log(filePath);

  console.log(
    "\nSUCCESS: MediTrace authorization packet generated!"
  );
}

main().catch((error) => {
  console.error("\nPacket generation failed:", error);
  process.exitCode = 1;
});
