
import {
  recoverTypedDataAddress,
  keccak256,
  toBytes,
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
import { randomUUID } from "node:crypto";

interface UsedNonce {
  manufacturer: string;
  nonce: string;
  serialNumber: string;
  acceptedAt: string;
}

interface PendingEvent {
  eventId: string;
  eventType: string;
  gtin: string;
  serialNumber: string;
  batchNumber: string;
  manufacturer: string;
  distributor: string;
  nonce: string;
  receiptTimestamp: string;
  chainId: number;
  contractAddress: string;
  status: "PENDING_SYNC" | "SYNCING" | "CONFIRMED" | "REJECTED";
  createdAt: string;
}

async function main() {
  console.log("\n===== MEDiTRACE OFFLINE RECEIPT QUEUE =====");

  // =====================================
  // 1. LOAD AUTHORIZATION PACKET
  // =====================================

  const packetPath = join(
    process.cwd(),
    "packets",
    "authorization-SN100005.json"
  );

  const packet = JSON.parse(
    await readFile(packetPath, "utf8")
  );

  if (
    packet.packetVersion !== "1.0" ||
    packet.protocol !== "MediTrace-EIP712"
  ) {
    throw new Error("Invalid authorization packet");
  }

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

  // =====================================
  // 2. VERIFY TRUSTED PARTICIPANTS
  // =====================================

  console.log("\n1. VERIFYING AUTHORIZATION");

  const trustedManufacturers: Address[] = [
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  ];

  const localDistributor: Address =
    "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";

  if (
    !trustedManufacturers.some(
      (address) =>
        address.toLowerCase() ===
        authorization.manufacturer.toLowerCase()
    )
  ) {
    throw new Error("Untrusted manufacturer");
  }

  if (
    authorization.distributor.toLowerCase() !==
    localDistributor.toLowerCase()
  ) {
    throw new Error("Wrong distributor");
  }

  const currentTime = BigInt(
    Math.floor(Date.now() / 1000)
  );

  if (authorization.expiresAt < currentTime) {
    throw new Error("Authorization expired");
  }

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

  console.log("Manufacturer signature: VALID");
  console.log("Distributor identity: VALID");
  console.log("Authorization expiry: VALID");

  // =====================================
  // 3. CHECK PERSISTENT NONCE DATABASE
  // =====================================

  console.log("\n2. CHECKING PREVIOUS AUTHORIZATION");

  const dataDirectory = join(process.cwd(), "data");

  const nonceDatabasePath = join(
    dataDirectory,
    "used-nonces.json"
  );

  const nonceContent = await readFile(
    nonceDatabasePath,
    "utf8"
  );

  const usedNonces: UsedNonce[] = JSON.parse(nonceContent);

  const nonceAccepted = usedNonces.some(
    (record) =>
      record.manufacturer.toLowerCase() ===
        authorization.manufacturer.toLowerCase() &&
      record.nonce === authorization.nonce.toString() &&
      record.serialNumber === authorization.serialNumber
  );

  if (!nonceAccepted) {
    throw new Error(
      "Authorization has not been accepted by the local verifier"
    );
  }

  console.log("Previously verified nonce: FOUND");

  // =====================================
  // 4. LOAD EXISTING EVENT QUEUE
  // =====================================

  console.log("\n3. CHECKING EVENT QUEUE");

  const queueDirectory = join(
    process.cwd(),
    "data"
  );

  const queuePath = join(
    queueDirectory,
    "pending-events.json"
  );

  await mkdir(queueDirectory, { recursive: true });

  let events: PendingEvent[] = [];

  try {
    events = JSON.parse(
      await readFile(queuePath, "utf8")
    );

    if (!Array.isArray(events)) {
      throw new Error("Invalid event queue format");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      events = [];
    } else {
      throw error;
    }
  }

  // One receipt event per manufacturer + nonce.
  const eventKey = keccak256(
    toBytes(
      `${authorization.manufacturer.toLowerCase()}:${authorization.nonce}:RECEIVED`
    )
  );

  const existingEvent = events.find(
    (event) => event.eventId === eventKey
  );

  if (existingEvent) {
    throw new Error(
      `Receipt event already exists with status: ${existingEvent.status}`
    );
  }

  // =====================================
  // 5. RECORD OFFLINE RECEIPT
  // =====================================

  console.log("\n4. RECORDING OFFLINE RECEIPT");

  const receiptTimestamp = new Date().toISOString();

  const newEvent: PendingEvent = {
    eventId: eventKey,
    eventType: "MEDICINE_RECEIVED",

    gtin: authorization.gtin,
    serialNumber: authorization.serialNumber,
    batchNumber: authorization.batchNumber,

    manufacturer: authorization.manufacturer,
    distributor: authorization.distributor,

    nonce: authorization.nonce.toString(),

    receiptTimestamp,

    chainId: domain.chainId,
    contractAddress: domain.verifyingContract,

    status: "PENDING_SYNC",

    createdAt: new Date().toISOString(),
  };

  events.push(newEvent);

  // Write to temporary file before replacing queue file.
  const temporaryPath = `${queuePath}.tmp`;

  await writeFile(
    temporaryPath,
    JSON.stringify(events, null, 2),
    "utf8"
  );

  await rename(temporaryPath, queuePath);

  // =====================================
  // 6. DISPLAY RESULT
  // =====================================

  console.log("Event ID:", newEvent.eventId);
  console.log("Medicine:", newEvent.serialNumber);
  console.log("Event:", newEvent.eventType);
  console.log("Receipt time:", newEvent.receiptTimestamp);
  console.log("Status:", newEvent.status);

  console.log("\n===== OFFLINE RECEIPT RESULTS =====");

  console.log("Authorization verification: SUCCESS");
  console.log("Nonce database check: SUCCESS");
  console.log("Duplicate event check: SUCCESS");
  console.log("Offline receipt recording: SUCCESS");

  console.log("\nEvent saved to:");
  console.log(queuePath);

  console.log(
    "\nSUCCESS: Offline receipt added to pending synchronization queue!"
  );

  console.log(
    "\nNOTE: This is a locally recorded receipt claim. " +
    "It is not yet a blockchain-confirmed receipt."
  );
}

main().catch((error) => {
  console.error("\nOffline receipt failed:", error.message);
  process.exitCode = 1;
});
