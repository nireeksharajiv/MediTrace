
import {
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";

import {
  readFile,
  writeFile,
  mkdir,
  rename,
} from "node:fs/promises";

import { join } from "node:path";

interface UsedNonce {
  manufacturer: string;
  nonce: string;
  serialNumber: string;
  acceptedAt: string;
}

async function main() {
  console.log("\n===== MEDiTRACE PERSISTENT OFFLINE VERIFICATION =====");

  // =====================================
  // 1. LOAD AUTHORIZATION PACKET
  // =====================================

  const packetPath = join(
    process.cwd(),
    "packets",
    "authorization-SN100005.json"
  );

  const packetContent = await readFile(packetPath, "utf8");
  const packet = JSON.parse(packetContent);

  if (
    packet.packetVersion !== "1.0" ||
    packet.protocol !== "MediTrace-EIP712"
  ) {
    throw new Error("Invalid authorization packet format");
  }

  console.log("\n1. AUTHORIZATION PACKET LOADED");

  // =====================================
  // 2. EXTRACT SIGNED INFORMATION
  // =====================================

  const domain = {
    name: packet.domain.name,
    version: packet.domain.version,
    chainId: Number(packet.domain.chainId),
    verifyingContract: packet.domain.verifyingContract as Address,
  };

  const authorization = {
    gtin: String(packet.authorization.gtin),
    serialNumber: String(packet.authorization.serialNumber),
    batchNumber: String(packet.authorization.batchNumber),
    manufacturer: packet.authorization.manufacturer as Address,
    distributor: packet.authorization.distributor as Address,
    nonce: BigInt(packet.authorization.nonce),
    expiresAt: BigInt(packet.authorization.expiresAt),
  };

  const signature = packet.signature as Hex;

  console.log("Medicine:", authorization.serialNumber);

  // =====================================
  // 3. VERIFY TRUSTED PARTICIPANTS
  // =====================================

  console.log("\n2. VERIFYING PARTICIPANTS");

  // Development-only trusted manufacturer registry.
  const trustedManufacturers: Address[] = [
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  ];

  // Development-only local distributor identity.
  const localDistributor: Address =
    "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";

  const isTrustedManufacturer = trustedManufacturers.some(
    (address) =>
      address.toLowerCase() ===
      authorization.manufacturer.toLowerCase()
  );

  if (!isTrustedManufacturer) {
    throw new Error("Untrusted manufacturer");
  }

  if (
    authorization.distributor.toLowerCase() !==
    localDistributor.toLowerCase()
  ) {
    throw new Error("Wrong distributor");
  }

  console.log("Manufacturer: VALID");
  console.log("Distributor: VALID");

  // =====================================
  // 4. VERIFY EXPIRY
  // =====================================

  console.log("\n3. CHECKING EXPIRY");

  const currentTime = BigInt(
    Math.floor(Date.now() / 1000)
  );

  if (authorization.expiresAt < currentTime) {
    throw new Error("Authorization expired");
  }

  console.log("Expiry: VALID");

  // =====================================
  // 5. VERIFY EIP-712 SIGNATURE
  // =====================================

  console.log("\n4. VERIFYING DIGITAL SIGNATURE");

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

  const recoveredAddress = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
    signature,
  });

  if (
    recoveredAddress.toLowerCase() !==
    authorization.manufacturer.toLowerCase()
  ) {
    throw new Error("Invalid manufacturer signature");
  }

  console.log("Signature: VALID");

  // =====================================
  // 6. LOAD PERSISTENT NONCE DATABASE
  // =====================================

  console.log("\n5. CHECKING PERSISTENT NONCE DATABASE");

  const dataDirectory = join(process.cwd(), "data");

  const databasePath = join(
    dataDirectory,
    "used-nonces.json"
  );

  await mkdir(dataDirectory, { recursive: true });

  let usedNonces: UsedNonce[] = [];

  try {
    const databaseContent = await readFile(
      databasePath,
      "utf8"
    );

    usedNonces = JSON.parse(databaseContent);

    if (!Array.isArray(usedNonces)) {
      throw new Error("Invalid nonce database format");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      usedNonces = [];
    } else {
      throw error;
    }
  }

  // Manufacturer + nonce uniquely identifies this
  // authorization nonce within this local registry.

  const nonceKey =
    `${authorization.manufacturer.toLowerCase()}:${authorization.nonce}`;

  const alreadyUsed = usedNonces.some(
    (record) =>
      `${record.manufacturer.toLowerCase()}:${record.nonce}` ===
      nonceKey
  );

  if (alreadyUsed) {
    throw new Error(
      "REPLAY REJECTED: This authorization nonce was already used on this device"
    );
  }

  console.log("Nonce:", authorization.nonce.toString());
  console.log("Nonce is unused on this device");

  // =====================================
  // 7. SAVE NONCE PERMANENTLY
  // =====================================

  console.log("\n6. SAVING NONCE TO LOCAL DATABASE");

  const newRecord: UsedNonce = {
    manufacturer: authorization.manufacturer,
    nonce: authorization.nonce.toString(),
    serialNumber: authorization.serialNumber,
    acceptedAt: new Date().toISOString(),
  };

  usedNonces.push(newRecord);

  // Write a temporary file, then rename it.
  // This reduces the chance of a partially written database.

  const temporaryPath = `${databasePath}.tmp`;

  await writeFile(
    temporaryPath,
    JSON.stringify(usedNonces, null, 2),
    "utf8"
  );

  await rename(temporaryPath, databasePath);

  console.log("Nonce successfully saved");
  console.log("Database:", databasePath);

  // =====================================
  // 8. FINAL RESULTS
  // =====================================

  console.log("\n===== FINAL VERIFICATION RESULTS =====");

  console.log("Packet format: SUCCESS");
  console.log("Manufacturer verification: SUCCESS");
  console.log("Distributor verification: SUCCESS");
  console.log("Expiry validation: SUCCESS");
  console.log("Digital signature: SUCCESS");
  console.log("Persistent nonce check: SUCCESS");
  console.log("Nonce storage: SUCCESS");

  console.log(
    "\nSUCCESS: Offline authorization accepted and stored!"
  );
}

main().catch((error) => {
  console.error("\nOffline verification failed:", error.message);
  process.exitCode = 1;
});
