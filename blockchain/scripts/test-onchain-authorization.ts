
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  // Updated MediTrace V2 deployment
  const contractAddress =
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const [admin, manufacturer, distributor] =
    await viem.getWalletClients();

  if (!admin || !manufacturer || !distributor) {
    throw new Error("Required wallets not available");
  }

  const contractName = "contracts/MediTrace.sol:MediTrace";

  // Connect all three participants
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

  // Fresh medicine details
  const gtin = "08901234560013";
  const serialNumber = "SN100003";
  const batchNumber = "BAT2026001";
  const expiryDate = "2028-01-14";

  // Fresh authorization nonce
  const nonce = 1003n;

  console.log("\n===== MEDiTRACE ON-CHAIN AUTHORIZATION TEST =====");

  console.log("\nContract Address:", contractAddress);
  console.log("Chain ID:", chainId);

  console.log("\nManufacturer:", manufacturer.account.address);
  console.log("Distributor:", distributor.account.address);

  // =========================================
  // 1. REGISTER MEDICINE
  // =========================================

  console.log("\n1. REGISTERING NEW MEDICINE");

  const registrationTx =
    await manufacturerContract.write.registerMedicine([
      gtin,
      serialNumber,
      batchNumber,
      expiryDate,
    ]);

  const registrationReceipt =
    await publicClient.waitForTransactionReceipt({
      hash: registrationTx,
    });

  if (registrationReceipt.status !== "success") {
    throw new Error("Medicine registration failed");
  }

  console.log("Registration transaction:", registrationTx);
  console.log("Medicine registered successfully!");

  // =========================================
  // 2. CREATE AUTHORIZATION
  // =========================================

  const expiresAt = BigInt(
    Math.floor(Date.now() / 1000) + 3600
  );

  const domain = {
    name: "MediTrace",
    version: "1",
    chainId,
    verifyingContract: contractAddress as `0x${string}`,
  };

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

  // =========================================
  // 3. MANUFACTURER SIGNS AUTHORIZATION
  // =========================================

  console.log("\n2. SIGNING AUTHORIZATION");

  const signature = await manufacturer.signTypedData({
    account: manufacturer.account,
    domain,
    types,
    primaryType: "TransferAuthorization",
    message: authorization,
  });

  console.log("Manufacturer:", authorization.manufacturer);
  console.log("Distributor:", authorization.distributor);
  console.log("Serial Number:", serialNumber);
  console.log("Nonce:", nonce.toString());
  console.log("Signature generated:", signature);

  // =========================================
  // 4. DISTRIBUTOR SUBMITS AUTHORIZATION
  // =========================================

  console.log("\n3. SUBMITTING AUTHORIZATION TO BLOCKCHAIN");

  const dispatchTx =
    await distributorContract.write.dispatchMedicineWithAuthorization([
      authorization,
      signature,
    ]);

  const dispatchReceipt =
    await publicClient.waitForTransactionReceipt({
      hash: dispatchTx,
    });

  if (dispatchReceipt.status !== "success") {
    throw new Error("Authorized dispatch transaction failed");
  }

  console.log("Authorization accepted!");
  console.log("Dispatch transaction:", dispatchTx);

  // =========================================
  // 5. VERIFY NONCE CONSUMPTION
  // =========================================

  console.log("\n4. CHECKING NONCE");

  const nonceUsed = await adminContract.read.usedNonces([
    manufacturer.account.address,
    nonce,
  ]);

  console.log("Nonce used:", nonceUsed);

  if (!nonceUsed) {
    throw new Error("Nonce was not marked as used");
  }

  // =========================================
  // 6. VERIFY MEDICINE STATUS
  // =========================================

  console.log("\n5. CHECKING MEDICINE STATUS");

  const medicine = await adminContract.read.getMedicine([
    gtin,
    serialNumber,
  ]);

  console.log("Medicine Serial:", medicine.serialNumber);
  console.log("Status:", medicine.status);
  console.log("Dispatched To:", medicine.dispatchedTo);

  if (medicine.status !== 2) {
    throw new Error("Medicine did not reach Dispatched status");
  }

  if (
    medicine.dispatchedTo.toLowerCase() !==
    distributor.account.address.toLowerCase()
  ) {
    throw new Error("Incorrect distributor recorded");
  }

  // =========================================
  // 7. TEST DUPLICATE AUTHORIZATION
  // =========================================

  console.log("\n6. TESTING DUPLICATE AUTHORIZATION");

  let replayRejected = false;

  try {
    const replayTx =
      await distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]);

    const replayReceipt =
      await publicClient.waitForTransactionReceipt({
        hash: replayTx,
      });

    if (replayReceipt.status === "reverted") {
      replayRejected = true;
      console.log("Duplicate authorization rejected on-chain!");
      console.log("Replay transaction:", replayTx);
    }
  } catch (error) {
    replayRejected = true;

    console.log("Duplicate authorization rejected!");
    console.log("Reason:", String(error).slice(0, 300));
  }

  if (!replayRejected) {
    throw new Error(
      "Duplicate authorization was not rejected"
    );
  }

  // =========================================
  // 8. FINAL RESULTS
  // =========================================

  console.log("\n===== FINAL TEST RESULTS =====");

  console.log("Medicine registration: SUCCESS");
  console.log("Manufacturer signature: SUCCESS");
  console.log("Authorized dispatch: SUCCESS");
  console.log("Nonce consumption: SUCCESS");
  console.log("Medicine status verification: SUCCESS");
  console.log("Duplicate authorization rejection: SUCCESS");

  console.log(
    "\nSUCCESS: MediTrace EIP-712 authorization and replay protection verified!"
  );
}

main().catch((error) => {
  console.error("\nAuthorization test failed:", error);
  process.exitCode = 1;
});
