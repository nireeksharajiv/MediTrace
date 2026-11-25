
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

describe("MediTrace", async function () {
  const { viem } = await network.connect();

  const [admin, manufacturer, distributor, outsider] =
    await viem.getWalletClients();

  const gtin = "08901234560013";
  const serial = "SN100001";
  const batch = "BAT2026001";
  const expiry = "2028-01-14";

  async function deployAndSetup() {
    const contract = await viem.deployContract("MediTrace");

    await contract.write.authorizeManufacturer([
      manufacturer.account.address,
    ]);

    await contract.write.authorizeDistributor([
      distributor.account.address,
    ]);

    return contract;
  }

  async function getContractFor(
    contract: Awaited<ReturnType<typeof viem.deployContract>>,
    wallet: typeof manufacturer,
  ) {
    return viem.getContractAt(
      "MediTrace",
      contract.address,
      { client: { wallet } },
    );
  }

  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const chainId = await publicClient.getChainId();

  const transferAuthorizationTypes = {
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

  function getDomain(contractAddress: `0x${string}`) {
    return {
      name: "MediTrace",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    };
  }

  async function createSignedAuthorization(
    contractAddress: `0x${string}`,
    signer: typeof manufacturer,
    overrides: Partial<{
      gtin: string;
      serialNumber: string;
      batchNumber: string;
      manufacturer: `0x${string}`;
      distributor: `0x${string}`;
      nonce: bigint;
      expiresAt: bigint;
    }> = {},
  ) {
    const authorization = {
      gtin: overrides.gtin ?? gtin,
      serialNumber: overrides.serialNumber ?? serial,
      batchNumber: overrides.batchNumber ?? batch,
      manufacturer: overrides.manufacturer ?? manufacturer.account.address,
      distributor: overrides.distributor ?? distributor.account.address,
      nonce: overrides.nonce ?? 1001n,
      expiresAt: overrides.expiresAt ?? BigInt(Math.floor(Date.now() / 1000) + 7200),
    };

    const signature = await signer.signTypedData({
      account: signer.account,
      domain: getDomain(contractAddress),
      types: transferAuthorizationTypes,
      primaryType: "TransferAuthorization",
      message: authorization,
    });

    return { authorization, signature };
  }

  // 1. AUTHORIZATION

  it("should authorize manufacturer and distributor", async function () {
    const contract = await deployAndSetup();

    assert.equal(
      await contract.read.manufacturers([
        manufacturer.account.address,
      ]),
      true,
    );

    assert.equal(
      await contract.read.distributors([
        distributor.account.address,
      ]),
      true,
    );
  });

  // 2. REGISTRATION

  it("should register a medicine unit", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    await manufacturerContract.write.registerMedicine([
      gtin, serial, batch, expiry,
    ]);

    assert.equal(
      await contract.read.verifyMedicine([gtin, serial]),
      true,
    );
  });

  it("should reject duplicate registration", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    await manufacturerContract.write.registerMedicine([
      gtin, serial, batch, expiry,
    ]);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([
        gtin, serial, batch, expiry,
      ]),
      /Medicine already registered/,
    );
  });

  it("should reject unauthorized registration", async function () {
    const contract = await deployAndSetup();
    const outsiderContract = await getContractFor(
      contract,
      outsider,
    );

    await assert.rejects(
      outsiderContract.write.registerMedicine([
        gtin, serial, batch, expiry,
      ]),
      /Manufacturer not authorized/,
    );
  });

  // 3. LIFECYCLE

  it("should complete dispatch and receipt", async function () {
    const contract = await deployAndSetup();

    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    const distributorContract = await getContractFor(
      contract,
      distributor,
    );

    await manufacturerContract.write.registerMedicine([
      gtin, serial, batch, expiry,
    ]);

    await manufacturerContract.write.dispatchMedicine([
      gtin, serial, distributor.account.address,
    ]);

    let medicine = await contract.read.getMedicine([
      gtin, serial,
    ]);

    assert.equal(medicine.status, 2);

    await distributorContract.write.receiveMedicine([
      gtin, serial,
    ]);

    medicine = await contract.read.getMedicine([
      gtin, serial,
    ]);

    assert.equal(medicine.status, 3);
  });

  it("should reject receipt by the wrong distributor", async function () {
    const contract = await deployAndSetup();

    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    const outsiderContract = await getContractFor(
      contract,
      outsider,
    );

    await manufacturerContract.write.registerMedicine([
      gtin, serial, batch, expiry,
    ]);

    await manufacturerContract.write.dispatchMedicine([
      gtin, serial, distributor.account.address,
    ]);

    await assert.rejects(
      outsiderContract.write.receiveMedicine([
        gtin, serial,
      ]),
      /Distributor not authorized/,
    );
  });

  // 4. NEW SECURITY TESTS

  it("should prevent another authorized manufacturer from dispatching medicine", async function () {
    const contract = await deployAndSetup();

    await contract.write.authorizeManufacturer([
      outsider.account.address,
    ]);

    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    const otherManufacturerContract = await getContractFor(
      contract,
      outsider,
    );

    await manufacturerContract.write.registerMedicine([
      gtin, serial, batch, expiry,
    ]);

    await assert.rejects(
      otherManufacturerContract.write.dispatchMedicine([
        gtin, serial, distributor.account.address,
      ]),
      /Not the registering manufacturer/,
    );
  });

  it("should reject authorization by a non-admin", async function () {
    const contract = await deployAndSetup();
    const outsiderContract = await getContractFor(
      contract,
      outsider,
    );

    await assert.rejects(
      outsiderContract.write.authorizeManufacturer([
        outsider.account.address,
      ]),
      /Admin only/,
    );
  });

  it("should reject invalid expiry date format", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    await assert.rejects(
      manufacturerContract.write.registerMedicine([
        gtin,
        "SNINVALID",
        batch,
        "14-01-2028",
      ]),
      /Invalid expiry date/,
    );
  });

  it("should reject registration by a revoked manufacturer", async function () {
    const contract = await deployAndSetup();

    await contract.write.revokeManufacturer([
      manufacturer.account.address,
    ]);

    const manufacturerContract = await getContractFor(
      contract,
      manufacturer,
    );

    await assert.rejects(
      manufacturerContract.write.registerMedicine([
        gtin,
        "SNREVOKED",
        batch,
        expiry,
      ]),
      /Manufacturer not authorized/,
    );
  });

  it("should reject receipt if medicine has not been dispatched", async function () {
    const contract = await deployAndSetup();

    const distributorContract = await getContractFor(
      contract,
      distributor,
    );

    await assert.rejects(
      distributorContract.write.receiveMedicine([
        gtin, serial,
      ]),
      /Medicine not dispatched/,
    );
  });

  // =========================================
  // 5. EIP-712 SECURITY TESTS
  // =========================================

  it("should successfully dispatch medicine with valid EIP-712 authorization", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
      { nonce: 101n },
    );

    await distributorContract.write.dispatchMedicineWithAuthorization([
      authorization,
      signature,
    ]);

    const medicine = await contract.read.getMedicine([gtin, serial]);
    assert.equal(medicine.status, 2);
    assert.equal(
      medicine.dispatchedTo.toLowerCase(),
      distributor.account.address.toLowerCase(),
    );

    const nonceUsed = await contract.read.usedNonces([
      manufacturer.account.address,
      101n,
    ]);
    assert.equal(nonceUsed, true);
  });

  it("should reject authorized dispatch with invalid signature", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
    );

    // Corrupt the signature by flipping characters in the signature hex
    const corruptedSig = `${signature.slice(0, -4)}0000` as `0x${string}`;

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        corruptedSig,
      ]),
      /ECDSAInvalidSignature|Invalid manufacturer signature/,
    );
  });

  it("should reject authorized dispatch signed by an unauthorized/non-manufacturer signer", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    // Signed by outsider instead of manufacturer
    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      outsider,
      { manufacturer: manufacturer.account.address },
    );

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]),
      /Invalid manufacturer signature/,
    );
  });

  it("should reject authorized dispatch if GTIN is tampered", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
    );

    const tamperedAuth = { ...authorization, gtin: "08901234569999" };

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        tamperedAuth,
        signature,
      ]),
      /Medicine not available/,
    );
  });

  it("should reject authorized dispatch if serial number is tampered", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
    );

    const tamperedAuth = { ...authorization, serialNumber: "SNTAMPERED" };

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        tamperedAuth,
        signature,
      ]),
      /Medicine not available/,
    );
  });

  it("should reject authorized dispatch if batch number is tampered", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
    );

    const tamperedAuth = { ...authorization, batchNumber: "BATTAMPERED" };

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        tamperedAuth,
        signature,
      ]),
      /Batch mismatch/,
    );
  });

  it("should reject authorized dispatch by the wrong distributor", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
    );

    // Outsider calls instead of the designated distributor
    await assert.rejects(
      outsiderContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]),
      /Distributor not authorized/,
    );
  });

  it("should reject authorized dispatch with expired authorization packet", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    // Packet expiry in the past
    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
      { expiresAt: 1000000000n },
    );

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]),
      /Authorization expired/,
    );
  });

  it("should reject nonce replay in authorized dispatch", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    const serial2 = "SN100002";
    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);
    await manufacturerContract.write.registerMedicine([gtin, serial2, batch, expiry]);

    // Dispatch unit 1 with nonce 500n
    const auth1 = await createSignedAuthorization(contract.address, manufacturer, {
      serialNumber: serial,
      nonce: 500n,
    });
    await distributorContract.write.dispatchMedicineWithAuthorization([
      auth1.authorization,
      auth1.signature,
    ]);

    // Try to dispatch unit 2 reusing nonce 500n
    const auth2 = await createSignedAuthorization(contract.address, manufacturer, {
      serialNumber: serial2,
      nonce: 500n,
    });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        auth2.authorization,
        auth2.signature,
      ]),
      /Authorization already used/,
    );
  });

  it("should reject authorized dispatch on already dispatched medicine", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const auth1 = await createSignedAuthorization(contract.address, manufacturer, {
      nonce: 601n,
    });
    await distributorContract.write.dispatchMedicineWithAuthorization([
      auth1.authorization,
      auth1.signature,
    ]);

    // Attempt second authorized dispatch with fresh nonce
    const auth2 = await createSignedAuthorization(contract.address, manufacturer, {
      nonce: 602n,
    });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        auth2.authorization,
        auth2.signature,
      ]),
      /Medicine not available/,
    );
  });

  it("should reject authorized dispatch if manufacturer is revoked", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
    );

    // Admin revokes manufacturer before authorization is submitted
    await contract.write.revokeManufacturer([manufacturer.account.address]);

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]),
      /Manufacturer not authorized/,
    );
  });

  it("should reject authorized dispatch if manufacturer address is incorrect", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    // Claim outsider registered it
    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
      { manufacturer: outsider.account.address },
    );

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        signature,
      ]),
      /Manufacturer not authorized/,
    );
  });

  it("should not consume nonce if authorization fails", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    const unusedNonce = 9999n;
    const { authorization, signature } = await createSignedAuthorization(
      contract.address,
      manufacturer,
      { nonce: unusedNonce },
    );

    // Corrupt signature to force failure
    const badSig = `${signature.slice(0, -4)}ffff` as `0x${string}`;

    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([
        authorization,
        badSig,
      ]),
      /ECDSAInvalidSignature|Invalid manufacturer signature/,
    );

    // Verify nonce was NOT marked used
    assert.equal(
      await contract.read.usedNonces([manufacturer.account.address, unusedNonce]),
      false,
    );

    // Now submit with valid signature using the same nonce -> succeeds
    await distributorContract.write.dispatchMedicineWithAuthorization([
      authorization,
      signature,
    ]);

    assert.equal(
      await contract.read.usedNonces([manufacturer.account.address, unusedNonce]),
      true,
    );
  });

  // =========================================
  // 6. ROLE AND LIFECYCLE TESTS
  // =========================================

  it("should reject receipt by a revoked distributor", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);
    await manufacturerContract.write.dispatchMedicine([
      gtin,
      serial,
      distributor.account.address,
    ]);

    // Admin revokes distributor before receipt
    await contract.write.revokeDistributor([distributor.account.address]);

    await assert.rejects(
      distributorContract.write.receiveMedicine([gtin, serial]),
      /Distributor not authorized/,
    );
  });

  it("should reject dispatch to a revoked distributor", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    // Admin revokes distributor before dispatch
    await contract.write.revokeDistributor([distributor.account.address]);

    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([
        gtin,
        serial,
        distributor.account.address,
      ]),
      /Distributor not authorized/,
    );
  });

  it("should reject dispatch by an unauthorized outsider", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);

    await assert.rejects(
      outsiderContract.write.dispatchMedicine([
        gtin,
        serial,
        distributor.account.address,
      ]),
      /Manufacturer not authorized/,
    );
  });

  it("should reject duplicate receipt", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    await manufacturerContract.write.registerMedicine([gtin, serial, batch, expiry]);
    await manufacturerContract.write.dispatchMedicine([
      gtin,
      serial,
      distributor.account.address,
    ]);
    await distributorContract.write.receiveMedicine([gtin, serial]);

    const medicine = await contract.read.getMedicine([gtin, serial]);
    assert.equal(medicine.status, 3);

    // Second receipt attempt must revert
    await assert.rejects(
      distributorContract.write.receiveMedicine([gtin, serial]),
      /Medicine not dispatched/,
    );
  });

  // =========================================
  // 7. CALENDAR & EXPIRY TESTS
  // =========================================

  it("should accept valid leap-year date (2028-02-29)", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    await manufacturerContract.write.registerMedicine([
      gtin,
      "SNLEAP28",
      batch,
      "2028-02-29",
    ]);

    assert.equal(
      await contract.read.verifyMedicine([gtin, "SNLEAP28"]),
      true,
    );
  });

  it("should reject invalid leap-year dates (2025-02-29 and 2026-02-29)", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([
        gtin,
        "SNNOLEAP25",
        batch,
        "2025-02-29",
      ]),
      /Invalid expiry date/,
    );

    await assert.rejects(
      manufacturerContract.write.registerMedicine([
        gtin,
        "SNNOLEAP26",
        batch,
        "2026-02-29",
      ]),
      /Invalid expiry date/,
    );
  });

  it("should reject impossible calendar dates", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    const impossibleDates = [
      "2026-02-31", // Feb 31 does not exist
      "2026-13-01", // Month 13 does not exist
      "2026-04-31", // April has 30 days
      "2026-00-10", // Month 0 does not exist
      "2026-01-00", // Day 0 does not exist
    ];

    for (const badDate of impossibleDates) {
      await assert.rejects(
        manufacturerContract.write.registerMedicine([
          gtin,
          `SN-${badDate}`,
          batch,
          badDate,
        ]),
        /Invalid expiry date/,
      );
    }
  });

  it("should reject registration of already-expired medicine", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([
        gtin,
        "SNPAST",
        batch,
        "2020-01-01",
      ]),
      /Medicine expired/,
    );
  });

  it("should keep medicine valid for entire expiry day and expire on following day", async function () {
    const snapshotId = await testClient.snapshot();
    try {
      const contract = await deployAndSetup();
      const manufacturerContract = await getContractFor(contract, manufacturer);
      const distributorContract = await getContractFor(contract, distributor);

      const expiryTestDate = "2028-12-31";
      const endOfDayTimestamp = await contract.read.expiryToEndOfDayTimestamp([
        expiryTestDate,
      ]);

      // End-of-day timestamp for 2028-12-31 is 1861919999 (23:59:59 UTC)
      assert.equal(endOfDayTimestamp, 1861919999n);

      // Register medicine
      await manufacturerContract.write.registerMedicine([
        gtin,
        "SN-EXP-TEST",
        batch,
        expiryTestDate,
      ]);

      // Set time to within the expiry day (100 seconds before end of day)
      await testClient.setNextBlockTimestamp({ timestamp: 1861919899n });
      await testClient.mine({ blocks: 1 });

      // Should NOT be expired yet
      assert.equal(
        await contract.read.isMedicineExpired([gtin, "SN-EXP-TEST"]),
        false,
      );

      // Normal dispatch works during the expiry day
      await manufacturerContract.write.dispatchMedicine([
        gtin,
        "SN-EXP-TEST",
        distributor.account.address,
      ]);

      // Advance by remaining seconds to 1861920000 (January 1, 2029 00:00:00 UTC)
      await testClient.setNextBlockTimestamp({ timestamp: 1861920000n });
      await testClient.mine({ blocks: 1 });

      // Medicine is now expired!
      assert.equal(
        await contract.read.isMedicineExpired([gtin, "SN-EXP-TEST"]),
        true,
      );

      // Receiving after expiry must be rejected
      await assert.rejects(
        distributorContract.write.receiveMedicine([gtin, "SN-EXP-TEST"]),
        /Medicine expired/,
      );
    } finally {
      await testClient.revert({ id: snapshotId });
    }
  });

  it("should reject normal dispatch of expired medicine", async function () {
    const snapshotId = await testClient.snapshot();
    try {
      const contract = await deployAndSetup();
      const manufacturerContract = await getContractFor(contract, manufacturer);

      const expDate = "2028-01-14";
      await manufacturerContract.write.registerMedicine([
        gtin,
        "SN-DISP-EXP",
        batch,
        expDate,
      ]);

      const endOfDay = await contract.read.expiryToEndOfDayTimestamp([expDate]);

      // Move past expiry date
      await testClient.setNextBlockTimestamp({ timestamp: endOfDay + 1n });
      await testClient.mine({ blocks: 1 });

      await assert.rejects(
        manufacturerContract.write.dispatchMedicine([
          gtin,
          "SN-DISP-EXP",
          distributor.account.address,
        ]),
        /Medicine expired/,
      );
    } finally {
      await testClient.revert({ id: snapshotId });
    }
  });

  it("should reject authorized dispatch of expired medicine", async function () {
    const snapshotId = await testClient.snapshot();
    try {
      const contract = await deployAndSetup();
      const manufacturerContract = await getContractFor(contract, manufacturer);
      const distributorContract = await getContractFor(contract, distributor);

      const expDate = "2028-01-14";
      await manufacturerContract.write.registerMedicine([
        gtin,
        "SN-AUTH-EXP",
        batch,
        expDate,
      ]);

      // Authorization packet itself expires far in the future (2035)
      const { authorization, signature } = await createSignedAuthorization(
        contract.address,
        manufacturer,
        {
          serialNumber: "SN-AUTH-EXP",
          expiresAt: 2050000000n,
        },
      );

      const endOfDay = await contract.read.expiryToEndOfDayTimestamp([expDate]);

      // Move past medicine expiry date
      await testClient.setNextBlockTimestamp({ timestamp: endOfDay + 1n });
      await testClient.mine({ blocks: 1 });

      await assert.rejects(
        distributorContract.write.dispatchMedicineWithAuthorization([
          authorization,
          signature,
        ]),
        /Medicine expired/,
      );
    } finally {
      await testClient.revert({ id: snapshotId });
    }
  });

  it("should reject receipt of expired medicine", async function () {
    const snapshotId = await testClient.snapshot();
    try {
      const contract = await deployAndSetup();
      const manufacturerContract = await getContractFor(contract, manufacturer);
      const distributorContract = await getContractFor(contract, distributor);

      const expDate = "2028-01-14";
      await manufacturerContract.write.registerMedicine([
        gtin,
        "SN-RCV-EXP",
        batch,
        expDate,
      ]);

      await manufacturerContract.write.dispatchMedicine([
        gtin,
        "SN-RCV-EXP",
        distributor.account.address,
      ]);

      const endOfDay = await contract.read.expiryToEndOfDayTimestamp([expDate]);

      // Fast-forward past expiry date before distributor receives
      await testClient.setNextBlockTimestamp({ timestamp: endOfDay + 1n });
      await testClient.mine({ blocks: 1 });

      await assert.rejects(
        distributorContract.write.receiveMedicine([gtin, "SN-RCV-EXP"]),
        /Medicine expired/,
      );
    } finally {
      await testClient.revert({ id: snapshotId });
    }
  });


  // =========================================================================
  // PHASE 3B: COMPREHENSIVE RECALL & QUARANTINE SAFETY TEST SUITE
  // =========================================================================

  const allWallets = await viem.getWalletClients();
  const manufacturer2 = allWallets[4] ?? outsider;

  // -------------------------------------------------------------------------
  // 1. UNIT SAFETY TESTS
  // -------------------------------------------------------------------------

  it("should allow registering manufacturer to quarantine its registered unit and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-Q1";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    const hash = await manufacturerContract.write.quarantineMedicine([
      gtin,
      sn,
      "Suspected particulate contamination",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineQuarantined",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.gtin, gtin);
    assert.equal(logs[0].args.serialNumber, sn);
    assert.equal(logs[0].args.reason, "Suspected particulate contamination");
    assert.equal(logs[0].args.initiator?.toLowerCase(), manufacturer.account.address.toLowerCase());

    const id = await contract.read.getMedicineId([gtin, sn]);
    assert.equal(await contract.read.unitQuarantined([id]), true);
    assert.equal(await contract.read.unitQuarantineReason([id]), "Suspected particulate contamination");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), false);
  });

  it("should allow admin to quarantine a registered unit and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-Q2";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    const hash = await contract.write.quarantineMedicine([
      gtin,
      sn,
      "Regulatory compliance hold",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineQuarantined",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.initiator?.toLowerCase(), admin.account.address.toLowerCase());
    const id = await contract.read.getMedicineId([gtin, sn]);
    assert.equal(await contract.read.unitQuarantined([id]), true);
  });

  it("should reject unit quarantine by an unauthorized outsider", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);
    const sn = "SN-U-Q3";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    await assert.rejects(
      outsiderContract.write.quarantineMedicine([gtin, sn, "Outsider attempt"]),
      /Unauthorized/,
    );
  });

  it("should reject unit quarantine by another authorized manufacturer who did not register it", async function () {
    const contract = await deployAndSetup();
    await contract.write.authorizeManufacturer([manufacturer2.account.address]);
    const manufacturer1Contract = await getContractFor(contract, manufacturer);
    const manufacturer2Contract = await getContractFor(contract, manufacturer2);
    const sn = "SN-U-Q4";
    await manufacturer1Contract.write.registerMedicine([gtin, sn, batch, expiry]);

    await assert.rejects(
      manufacturer2Contract.write.quarantineMedicine([gtin, sn, "Unauthorized mfr attempt"]),
      /Unauthorized/,
    );
  });

  it("should allow registering manufacturer to recall its registered unit and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-R1";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    const hash = await manufacturerContract.write.recallMedicine([
      gtin,
      sn,
      "Critical active ingredient defect",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineRecalled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Critical active ingredient defect");
    const id = await contract.read.getMedicineId([gtin, sn]);
    assert.equal(await contract.read.unitRecalled([id]), true);
    assert.equal(await contract.read.unitRecallReason([id]), "Critical active ingredient defect");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), false);
  });

  it("should allow admin to recall a registered unit and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-R2";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    const hash = await contract.write.recallMedicine([
      gtin,
      sn,
      "Emergency health agency order",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineRecalled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.initiator?.toLowerCase(), admin.account.address.toLowerCase());
    const id = await contract.read.getMedicineId([gtin, sn]);
    assert.equal(await contract.read.unitRecalled([id]), true);
  });

  it("should reject unit recall by an unauthorized outsider", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);
    const sn = "SN-U-R3";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    await assert.rejects(
      outsiderContract.write.recallMedicine([gtin, sn, "Outsider recall attempt"]),
      /Unauthorized/,
    );
  });

  it("should allow only admin to lift unit quarantine and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-L1";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Temporary hold"]);

    const hash = await contract.write.liftUnitQuarantine([
      gtin,
      sn,
      "Lab tests verified clean",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineQuarantineLifted",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Lab tests verified clean");
    const id = await contract.read.getMedicineId([gtin, sn]);
    assert.equal(await contract.read.unitQuarantined([id]), false);
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), true);
  });

  it("should reject unit quarantine lifting by the registering manufacturer", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-L2";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Hold"]);

    await assert.rejects(
      manufacturerContract.write.liftUnitQuarantine([gtin, sn, "Manufacturer attempt"]),
      /Admin only/,
    );
  });

  it("should reject lifting unit quarantine if unit is not quarantined", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-L3";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    await assert.rejects(
      contract.write.liftUnitQuarantine([gtin, sn, "Lift attempt on normal unit"]),
      /Not quarantined/,
    );
  });

  it("should confirm unit recall is permanent and cannot be lifted", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-PERM";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);
    await manufacturerContract.write.recallMedicine([gtin, sn, "Permanent recall"]);

    // Attempting to lift quarantine on a recalled unit must fail
    await assert.rejects(
      contract.write.liftUnitQuarantine([gtin, sn, "Attempt lift on recalled unit"]),
      /Not quarantined/,
    );

    // If unit was both quarantined and recalled, lifting quarantine must leave recall intact
    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Additional quarantine"]);
    await contract.write.liftUnitQuarantine([gtin, sn, "Quarantine cleared"]);

    const id = await contract.read.getMedicineId([gtin, sn]);
    assert.equal(await contract.read.unitQuarantined([id]), false);
    assert.equal(await contract.read.unitRecalled([id]), true);
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), false);
    const [status] = await contract.read.getEffectiveSafetyStatus([gtin, sn]);
    assert.equal(status, 2); // Recalled
  });

  it("should reject unit quarantine, recall, or lifting with empty reason", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-U-EMPTY";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    await assert.rejects(
      manufacturerContract.write.quarantineMedicine([gtin, sn, ""]),
      /Reason required/,
    );
    await assert.rejects(
      manufacturerContract.write.recallMedicine([gtin, sn, ""]),
      /Reason required/,
    );

    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Valid reason"]);
    await assert.rejects(
      contract.write.liftUnitQuarantine([gtin, sn, ""]),
      /Reason required/,
    );
  });

  it("should reject unit quarantine or recall on non-existent medicine", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    await assert.rejects(
      manufacturerContract.write.quarantineMedicine(["99999999999999", "SN-NONEXISTENT", "reason"]),
      /Medicine not found/,
    );
    await assert.rejects(
      manufacturerContract.write.recallMedicine(["99999999999999", "SN-NONEXISTENT", "reason"]),
      /Medicine not found/,
    );
  });

  // -------------------------------------------------------------------------
  // 2. MANUFACTURER-SPECIFIC BATCH TESTS
  // -------------------------------------------------------------------------

  it("should allow authorized manufacturer to quarantine its own batch and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-MFR-Q1";

    const hash = await manufacturerContract.write.quarantineBatchMfr([
      gtin,
      b,
      "Dissolution out of specification",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MfrBatchQuarantined",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.gtin, gtin);
    assert.equal(logs[0].args.batchNumber, b);
    assert.equal(logs[0].args.reason, "Dissolution out of specification");
    assert.equal(logs[0].args.manufacturer?.toLowerCase(), manufacturer.account.address.toLowerCase());

    const mfrKey = await contract.read.getMfrBatchKey([manufacturer.account.address, gtin, b]);
    assert.equal(await contract.read.mfrBatchQuarantined([mfrKey]), true);
    assert.equal(await contract.read.mfrBatchQuarantineReason([mfrKey]), "Dissolution out of specification");
  });

  it("should allow authorized manufacturer to recall its own batch and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-MFR-R1";

    const hash = await manufacturerContract.write.recallBatchMfr([
      gtin,
      b,
      "Toxic impurity discovered",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MfrBatchRecalled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Toxic impurity discovered");
    const mfrKey = await contract.read.getMfrBatchKey([manufacturer.account.address, gtin, b]);
    assert.equal(await contract.read.mfrBatchRecalled([mfrKey]), true);
    assert.equal(await contract.read.mfrBatchRecallReason([mfrKey]), "Toxic impurity discovered");
  });

  it("should prevent unauthorized manufacturer from altering another manufacturer's batch namespace", async function () {
    const contract = await deployAndSetup();
    await contract.write.authorizeManufacturer([manufacturer2.account.address]);
    const manufacturer2Contract = await getContractFor(contract, manufacturer2);
    const outsiderContract = await getContractFor(contract, outsider);
    const b = "BAT-MFR-ISO";

    // Manufacturer 2 quarantining batch b affects only Manufacturer 2's namespace
    await manufacturer2Contract.write.quarantineBatchMfr([gtin, b, "Mfr 2 batch hold"]);
    const key1 = await contract.read.getMfrBatchKey([manufacturer.account.address, gtin, b]);
    const key2 = await contract.read.getMfrBatchKey([manufacturer2.account.address, gtin, b]);

    assert.equal(await contract.read.mfrBatchQuarantined([key2]), true);
    assert.equal(await contract.read.mfrBatchQuarantined([key1]), false);

    // Outsider cannot call quarantineBatchMfr or recallBatchMfr
    await assert.rejects(
      outsiderContract.write.quarantineBatchMfr([gtin, b, "Outsider attempt"]),
      /Manufacturer not authorized/,
    );
    await assert.rejects(
      outsiderContract.write.recallBatchMfr([gtin, b, "Outsider attempt"]),
      /Manufacturer not authorized/,
    );
  });

  it("should allow only admin to lift manufacturer-batch quarantine and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-MFR-L1";
    await manufacturerContract.write.quarantineBatchMfr([gtin, b, "Batch investigation"]);

    const hash = await contract.write.liftMfrBatchQuarantine([
      manufacturer.account.address,
      gtin,
      b,
      "Root cause resolved and verified",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MfrBatchQuarantineLifted",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Root cause resolved and verified");
    const mfrKey = await contract.read.getMfrBatchKey([manufacturer.account.address, gtin, b]);
    assert.equal(await contract.read.mfrBatchQuarantined([mfrKey]), false);
  });

  it("should reject manufacturer-batch quarantine lifting by active manufacturer", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-MFR-L2";
    await manufacturerContract.write.quarantineBatchMfr([gtin, b, "Batch hold"]);

    await assert.rejects(
      manufacturerContract.write.liftMfrBatchQuarantine([
        manufacturer.account.address,
        gtin,
        b,
        "Manufacturer self-lift attempt",
      ]),
      /Admin only/,
    );
  });

  it("should reject lifting manufacturer-batch quarantine if batch is not quarantined", async function () {
    const contract = await deployAndSetup();
    const b = "BAT-MFR-NOTQ";

    await assert.rejects(
      contract.write.liftMfrBatchQuarantine([
        manufacturer.account.address,
        gtin,
        b,
        "Lift non-existent quarantine",
      ]),
      /Not quarantined/,
    );
  });

  it("should confirm manufacturer-batch recall is permanent and cannot be lifted", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-MFR-PERM";
    await manufacturerContract.write.recallBatchMfr([gtin, b, "Fatal reaction recall"]);

    // Attempting to lift quarantine on recalled batch fails if not quarantined
    await assert.rejects(
      contract.write.liftMfrBatchQuarantine([
        manufacturer.account.address,
        gtin,
        b,
        "Attempt lift",
      ]),
      /Not quarantined/,
    );

    // If both quarantined and recalled, lifting quarantine leaves recall intact
    await manufacturerContract.write.quarantineBatchMfr([gtin, b, "Precautionary quarantine"]);
    await contract.write.liftMfrBatchQuarantine([
      manufacturer.account.address,
      gtin,
      b,
      "Quarantine cleared",
    ]);

    const mfrKey = await contract.read.getMfrBatchKey([manufacturer.account.address, gtin, b]);
    assert.equal(await contract.read.mfrBatchQuarantined([mfrKey]), false);
    assert.equal(await contract.read.mfrBatchRecalled([mfrKey]), true);
  });

  it("should reject manufacturer batch operations with empty GTIN, batch number, or reason", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    await assert.rejects(
      manufacturerContract.write.quarantineBatchMfr(["", "B1", "Reason"]),
      /GTIN required/,
    );
    await assert.rejects(
      manufacturerContract.write.quarantineBatchMfr([gtin, "", "Reason"]),
      /Batch required/,
    );
    await assert.rejects(
      manufacturerContract.write.quarantineBatchMfr([gtin, "B1", ""]),
      /Reason required/,
    );

    await assert.rejects(
      manufacturerContract.write.recallBatchMfr(["", "B1", "Reason"]),
      /GTIN required/,
    );
    await assert.rejects(
      manufacturerContract.write.recallBatchMfr([gtin, "", "Reason"]),
      /Batch required/,
    );
    await assert.rejects(
      manufacturerContract.write.recallBatchMfr([gtin, "B1", ""]),
      /Reason required/,
    );

    await manufacturerContract.write.quarantineBatchMfr([gtin, "B1", "Valid"]);
    await assert.rejects(
      contract.write.liftMfrBatchQuarantine([manufacturer.account.address, "", "B1", "Reason"]),
      /GTIN required/,
    );
    await assert.rejects(
      contract.write.liftMfrBatchQuarantine([manufacturer.account.address, gtin, "", "Reason"]),
      /Batch required/,
    );
    await assert.rejects(
      contract.write.liftMfrBatchQuarantine([manufacturer.account.address, gtin, "B1", ""]),
      /Reason required/,
    );
  });

  // -------------------------------------------------------------------------
  // 3. GLOBAL BATCH TESTS
  // -------------------------------------------------------------------------

  it("should allow only admin to emergency quarantine a global batch and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);
    const b = "BAT-GLB-Q1";

    const hash = await contract.write.emergencyQuarantineBatchGlobal([
      gtin,
      b,
      "Cross-manufacturer national alert",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "GlobalBatchQuarantined",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.gtin, gtin);
    assert.equal(logs[0].args.batchNumber, b);
    assert.equal(logs[0].args.reason, "Cross-manufacturer national alert");

    const globalKey = await contract.read.getGlobalBatchKey([gtin, b]);
    assert.equal(await contract.read.globalBatchQuarantined([globalKey]), true);
    assert.equal(await contract.read.globalBatchQuarantineReason([globalKey]), "Cross-manufacturer national alert");

    // Non-admins rejected
    await assert.rejects(
      manufacturerContract.write.emergencyQuarantineBatchGlobal([gtin, "BAT-X", "reason"]),
      /Admin only/,
    );
    await assert.rejects(
      outsiderContract.write.emergencyQuarantineBatchGlobal([gtin, "BAT-X", "reason"]),
      /Admin only/,
    );
  });

  it("should allow only admin to emergency recall a global batch and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);
    const b = "BAT-GLB-R1";

    const hash = await contract.write.emergencyRecallBatchGlobal([
      gtin,
      b,
      "Global counterfeit API alert",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "GlobalBatchRecalled",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Global counterfeit API alert");
    const globalKey = await contract.read.getGlobalBatchKey([gtin, b]);
    assert.equal(await contract.read.globalBatchRecalled([globalKey]), true);

    await assert.rejects(
      manufacturerContract.write.emergencyRecallBatchGlobal([gtin, "BAT-Y", "reason"]),
      /Admin only/,
    );
    await assert.rejects(
      outsiderContract.write.emergencyRecallBatchGlobal([gtin, "BAT-Y", "reason"]),
      /Admin only/,
    );
  });

  it("should allow only admin to lift global batch quarantine and emit event", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const outsiderContract = await getContractFor(contract, outsider);
    const b = "BAT-GLB-L1";
    await contract.write.emergencyQuarantineBatchGlobal([gtin, b, "Hold"]);

    const hash = await contract.write.liftGlobalBatchQuarantine([
      gtin,
      b,
      "Worldwide clearance verified",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "GlobalBatchQuarantineLifted",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Worldwide clearance verified");
    const globalKey = await contract.read.getGlobalBatchKey([gtin, b]);
    assert.equal(await contract.read.globalBatchQuarantined([globalKey]), false);

    // Non-admin rejected
    await contract.write.emergencyQuarantineBatchGlobal([gtin, b, "Hold again"]);
    await assert.rejects(
      manufacturerContract.write.liftGlobalBatchQuarantine([gtin, b, "Attempt"]),
      /Admin only/,
    );
    await assert.rejects(
      outsiderContract.write.liftGlobalBatchQuarantine([gtin, b, "Attempt"]),
      /Admin only/,
    );
  });

  it("should reject lifting global batch quarantine if batch is not quarantined", async function () {
    const contract = await deployAndSetup();
    await assert.rejects(
      contract.write.liftGlobalBatchQuarantine([gtin, "BAT-GLB-NOTQ", "Attempt"]),
      /Not quarantined/,
    );
  });

  it("should confirm global batch recall is permanent and cannot be lifted", async function () {
    const contract = await deployAndSetup();
    const b = "BAT-GLB-PERM";
    await contract.write.emergencyRecallBatchGlobal([gtin, b, "Permanent recall"]);

    await assert.rejects(
      contract.write.liftGlobalBatchQuarantine([gtin, b, "Attempt lift"]),
      /Not quarantined/,
    );

    // If both quarantined and recalled, lifting quarantine leaves recall intact
    await contract.write.emergencyQuarantineBatchGlobal([gtin, b, "Quarantine layer"]);
    await contract.write.liftGlobalBatchQuarantine([gtin, b, "Lift quarantine layer"]);

    const globalKey = await contract.read.getGlobalBatchKey([gtin, b]);
    assert.equal(await contract.read.globalBatchQuarantined([globalKey]), false);
    assert.equal(await contract.read.globalBatchRecalled([globalKey]), true);
  });

  it("should reject global batch operations with empty GTIN, batch number, or reason", async function () {
    const contract = await deployAndSetup();

    await assert.rejects(
      contract.write.emergencyQuarantineBatchGlobal(["", "B1", "Reason"]),
      /GTIN required/,
    );
    await assert.rejects(
      contract.write.emergencyQuarantineBatchGlobal([gtin, "", "Reason"]),
      /Batch required/,
    );
    await assert.rejects(
      contract.write.emergencyQuarantineBatchGlobal([gtin, "B1", ""]),
      /Reason required/,
    );

    await assert.rejects(
      contract.write.emergencyRecallBatchGlobal(["", "B1", "Reason"]),
      /GTIN required/,
    );
    await assert.rejects(
      contract.write.emergencyRecallBatchGlobal([gtin, "", "Reason"]),
      /Batch required/,
    );
    await assert.rejects(
      contract.write.emergencyRecallBatchGlobal([gtin, "B1", ""]),
      /Reason required/,
    );

    await contract.write.emergencyQuarantineBatchGlobal([gtin, "B1", "Valid"]);
    await assert.rejects(
      contract.write.liftGlobalBatchQuarantine(["", "B1", "Reason"]),
      /GTIN required/,
    );
    await assert.rejects(
      contract.write.liftGlobalBatchQuarantine([gtin, "", "Reason"]),
      /Batch required/,
    );
    await assert.rejects(
      contract.write.liftGlobalBatchQuarantine([gtin, "B1", ""]),
      /Reason required/,
    );
  });

  // -------------------------------------------------------------------------
  // 4. EFFECTIVE SAFETY STATUS & PRECEDENCE TESTS
  // -------------------------------------------------------------------------

  it("should return Normal (status 0) and isMedicineSafe true for unrestricted medicine", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-EFF-NORM";
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);

    const [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, sn]);
    assert.equal(status, 0); // Normal
    assert.equal(reason, "");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), true);
  });

  it("should return Quarantined (status 1) and reason for unit, mfr batch, and global batch quarantine", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // 1. Unit quarantine
    const snUnit = "SN-EFF-UQ";
    await manufacturerContract.write.registerMedicine([gtin, snUnit, "BAT-EFF-1", expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, snUnit, "Unit Q Reason"]);
    let [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snUnit]);
    assert.equal(status, 1);
    assert.equal(reason, "Unit Q Reason");
    assert.equal(await contract.read.isMedicineSafe([gtin, snUnit]), false);

    // 2. Mfr batch quarantine
    const snMfr2 = "SN-EFF-MQ2";
    await manufacturerContract.write.registerMedicine([gtin, snMfr2, "BAT-EFF-MQ2", expiry]);
    await manufacturerContract.write.quarantineBatchMfr([gtin, "BAT-EFF-MQ2", "Mfr Batch Q Reason 2"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snMfr2]);
    assert.equal(status, 1);
    assert.equal(reason, "Mfr Batch Q Reason 2");
    assert.equal(await contract.read.isMedicineSafe([gtin, snMfr2]), false);

    // 3. Global batch quarantine
    const snGlb = "SN-EFF-GQ";
    await manufacturerContract.write.registerMedicine([gtin, snGlb, "BAT-EFF-GQ", expiry]);
    await contract.write.emergencyQuarantineBatchGlobal([gtin, "BAT-EFF-GQ", "Global Q Reason"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snGlb]);
    assert.equal(status, 1);
    assert.equal(reason, "Global Q Reason");
    assert.equal(await contract.read.isMedicineSafe([gtin, snGlb]), false);
  });

  it("should return Recalled (status 2) and reason for unit, mfr batch, and global batch recall", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // 1. Unit recall
    const snUnit = "SN-EFF-UR";
    await manufacturerContract.write.registerMedicine([gtin, snUnit, "BAT-EFF-UR", expiry]);
    await manufacturerContract.write.recallMedicine([gtin, snUnit, "Unit R Reason"]);
    let [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snUnit]);
    assert.equal(status, 2);
    assert.equal(reason, "Unit R Reason");

    // 2. Mfr batch recall
    const snMfr = "SN-EFF-MR";
    await manufacturerContract.write.registerMedicine([gtin, snMfr, "BAT-EFF-MR", expiry]);
    await manufacturerContract.write.recallBatchMfr([gtin, "BAT-EFF-MR", "Mfr Batch R Reason"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snMfr]);
    assert.equal(status, 2);
    assert.equal(reason, "Mfr Batch R Reason");

    // 3. Global batch recall
    const snGlb = "SN-EFF-GR";
    await manufacturerContract.write.registerMedicine([gtin, snGlb, "BAT-EFF-GR", expiry]);
    await contract.write.emergencyRecallBatchGlobal([gtin, "BAT-EFF-GR", "Global Batch R Reason"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snGlb]);
    assert.equal(status, 2);
    assert.equal(reason, "Global Batch R Reason");
  });

  it("should enforce that recall takes precedence over quarantine across all scopes", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // Case 1: Unit quarantined + Mfr batch recalled -> Recalled (Mfr batch recall reason)
    const sn1 = "SN-PREC-1";
    const b1 = "BAT-PREC-1";
    await manufacturerContract.write.registerMedicine([gtin, sn1, b1, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, sn1, "Unit Q"]);
    await manufacturerContract.write.recallBatchMfr([gtin, b1, "Mfr Batch R"]);
    let [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, sn1]);
    assert.equal(status, 2);
    assert.equal(reason, "Mfr Batch R");

    // Case 2: Unit quarantined + Global batch recalled -> Recalled (Global batch recall reason)
    const sn2 = "SN-PREC-2";
    const b2 = "BAT-PREC-2";
    await manufacturerContract.write.registerMedicine([gtin, sn2, b2, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, sn2, "Unit Q 2"]);
    await contract.write.emergencyRecallBatchGlobal([gtin, b2, "Global Batch R"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, sn2]);
    assert.equal(status, 2);
    assert.equal(reason, "Global Batch R");

    // Case 3: Mfr batch quarantined + Unit recalled -> Recalled (Unit recall reason)
    const sn3 = "SN-PREC-3";
    const b3 = "BAT-PREC-3";
    await manufacturerContract.write.registerMedicine([gtin, sn3, b3, expiry]);
    await manufacturerContract.write.quarantineBatchMfr([gtin, b3, "Mfr Batch Q"]);
    await manufacturerContract.write.recallMedicine([gtin, sn3, "Unit R 3"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, sn3]);
    assert.equal(status, 2);
    assert.equal(reason, "Unit R 3");

    // Case 4: Global batch quarantined + Unit recalled -> Recalled (Unit recall reason)
    const sn4 = "SN-PREC-4";
    const b4 = "BAT-PREC-4";
    await manufacturerContract.write.registerMedicine([gtin, sn4, b4, expiry]);
    await contract.write.emergencyQuarantineBatchGlobal([gtin, b4, "Global Batch Q"]);
    await manufacturerContract.write.recallMedicine([gtin, sn4, "Unit R 4"]);
    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, sn4]);
    assert.equal(status, 2);
    assert.equal(reason, "Unit R 4");
  });

  it("should enforce deterministic tie-breaking order among restrictions of the same category", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // Tie-break among recalls: Unit recall (1) > Mfr batch recall (2) > Global batch recall (3)
    const snR = "SN-TIE-R";
    const bR = "BAT-TIE-R";
    await manufacturerContract.write.registerMedicine([gtin, snR, bR, expiry]);
    await contract.write.emergencyRecallBatchGlobal([gtin, bR, "Global R"]);
    await manufacturerContract.write.recallBatchMfr([gtin, bR, "Mfr R"]);
    await manufacturerContract.write.recallMedicine([gtin, snR, "Unit R"]);

    let [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snR]);
    assert.equal(status, 2);
    assert.equal(reason, "Unit R");

    // Tie-break among quarantines: Unit quarantine (1) > Mfr batch quarantine (2) > Global batch quarantine (3)
    const snQ = "SN-TIE-Q";
    const bQ = "BAT-TIE-Q";
    await manufacturerContract.write.registerMedicine([gtin, snQ, bQ, expiry]);
    await contract.write.emergencyQuarantineBatchGlobal([gtin, bQ, "Global Q"]);
    await manufacturerContract.write.quarantineBatchMfr([gtin, bQ, "Mfr Q"]);
    await manufacturerContract.write.quarantineMedicine([gtin, snQ, "Unit Q"]);

    [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, snQ]);
    assert.equal(status, 1);
    assert.equal(reason, "Unit Q");
  });

  it("should ensure lifting one quarantine does not clear other active quarantine restrictions", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-INDEP-Q";
    const b = "BAT-INDEP-Q";
    await manufacturerContract.write.registerMedicine([gtin, sn, b, expiry]);

    // Apply Unit quarantine AND Global batch quarantine
    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Unit specific hold"]);
    await contract.write.emergencyQuarantineBatchGlobal([gtin, b, "Global wide hold"]);

    // Lift unit quarantine
    await contract.write.liftUnitQuarantine([gtin, sn, "Unit hold lifted"]);

    // Status MUST remain Quarantined under Global batch quarantine
    let [status, reason] = await contract.read.getEffectiveSafetyStatus([gtin, sn]);
    assert.equal(status, 1);
    assert.equal(reason, "Global wide hold");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), false);
  });

  it("should reject safety status query on non-existent medicine", async function () {
    const contract = await deployAndSetup();
    await assert.rejects(
      contract.read.getEffectiveSafetyStatus(["nonexistent", "nonexistent"]),
      /Medicine not found/,
    );
    await assert.rejects(
      contract.read.isMedicineSafe(["nonexistent", "nonexistent"]),
      /Medicine not found/,
    );
  });

  // -------------------------------------------------------------------------
  // 5. REGISTRATION RESTRICTION TESTS
  // -------------------------------------------------------------------------

  it("should reject registration when manufacturer-batch is quarantined", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-REG-MQ";
    await manufacturerContract.write.quarantineBatchMfr([gtin, b, "Hold prior to registration"]);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([gtin, "SN-REG-FAIL1", b, expiry]),
      /Batch is quarantined/,
    );
  });

  it("should reject registration when manufacturer-batch is recalled", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-REG-MR";
    await manufacturerContract.write.recallBatchMfr([gtin, b, "Pre-registration batch recall"]);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([gtin, "SN-REG-FAIL2", b, expiry]),
      /Batch is recalled/,
    );
  });

  it("should reject registration when global batch is quarantined", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-REG-GQ";
    await contract.write.emergencyQuarantineBatchGlobal([gtin, b, "Global embargo"]);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([gtin, "SN-REG-FAIL3", b, expiry]),
      /Batch is quarantined/,
    );
  });

  it("should reject registration when global batch is recalled", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-REG-GR";
    await contract.write.emergencyRecallBatchGlobal([gtin, b, "Global recall"]);

    await assert.rejects(
      manufacturerContract.write.registerMedicine([gtin, "SN-REG-FAIL4", b, expiry]),
      /Batch is recalled/,
    );
  });

  it("should allow registration after admin lifts batch quarantine", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // Mfr batch quarantine lifted
    const bMfr = "BAT-REG-MQLIFT";
    await manufacturerContract.write.quarantineBatchMfr([gtin, bMfr, "Temporary hold"]);
    await assert.rejects(
      manufacturerContract.write.registerMedicine([gtin, "SN-MQLIFT", bMfr, expiry]),
      /Batch is quarantined/,
    );
    await contract.write.liftMfrBatchQuarantine([manufacturer.account.address, gtin, bMfr, "Clearance"]);
    await manufacturerContract.write.registerMedicine([gtin, "SN-MQLIFT", bMfr, expiry]);
    assert.equal(await contract.read.verifyMedicine([gtin, "SN-MQLIFT"]), true);

    // Global batch quarantine lifted
    const bGlb = "BAT-REG-GQLIFT";
    await contract.write.emergencyQuarantineBatchGlobal([gtin, bGlb, "Global hold"]);
    await assert.rejects(
      manufacturerContract.write.registerMedicine([gtin, "SN-GQLIFT", bGlb, expiry]),
      /Batch is quarantined/,
    );
    await contract.write.liftGlobalBatchQuarantine([gtin, bGlb, "Global clearance"]);
    await manufacturerContract.write.registerMedicine([gtin, "SN-GQLIFT", bGlb, expiry]);
    assert.equal(await contract.read.verifyMedicine([gtin, "SN-GQLIFT"]), true);
  });

  // -------------------------------------------------------------------------
  // 6. DISPATCH RESTRICTION TESTS (DIRECT & EIP-712)
  // -------------------------------------------------------------------------

  it("should block direct dispatch for unit quarantine and unit recall", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // Unit quarantine
    const snQ = "SN-DISP-UQ";
    await manufacturerContract.write.registerMedicine([gtin, snQ, batch, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, snQ, "Hold"]);
    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([gtin, snQ, distributor.account.address]),
      /Medicine is quarantined/,
    );

    // Unit recall
    const snR = "SN-DISP-UR";
    await manufacturerContract.write.registerMedicine([gtin, snR, batch, expiry]);
    await manufacturerContract.write.recallMedicine([gtin, snR, "Recall"]);
    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([gtin, snR, distributor.account.address]),
      /Medicine is recalled/,
    );
  });

  it("should block direct dispatch for manufacturer-batch quarantine and recall", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // Mfr batch quarantine
    const snMQ = "SN-DISP-MQ";
    const bMQ = "BAT-DISP-MQ";
    await manufacturerContract.write.registerMedicine([gtin, snMQ, bMQ, expiry]);
    await manufacturerContract.write.quarantineBatchMfr([gtin, bMQ, "Batch Hold"]);
    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([gtin, snMQ, distributor.account.address]),
      /Medicine is quarantined/,
    );

    // Mfr batch recall
    const snMR = "SN-DISP-MR";
    const bMR = "BAT-DISP-MR";
    await manufacturerContract.write.registerMedicine([gtin, snMR, bMR, expiry]);
    await manufacturerContract.write.recallBatchMfr([gtin, bMR, "Batch Recall"]);
    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([gtin, snMR, distributor.account.address]),
      /Medicine is recalled/,
    );
  });

  it("should block direct dispatch for global batch quarantine and recall", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);

    // Global batch quarantine
    const snGQ = "SN-DISP-GQ";
    const bGQ = "BAT-DISP-GQ";
    await manufacturerContract.write.registerMedicine([gtin, snGQ, bGQ, expiry]);
    await contract.write.emergencyQuarantineBatchGlobal([gtin, bGQ, "Global Hold"]);
    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([gtin, snGQ, distributor.account.address]),
      /Medicine is quarantined/,
    );

    // Global batch recall
    const snGR = "SN-DISP-GR";
    const bGR = "BAT-DISP-GR";
    await manufacturerContract.write.registerMedicine([gtin, snGR, bGR, expiry]);
    await contract.write.emergencyRecallBatchGlobal([gtin, bGR, "Global Recall"]);
    await assert.rejects(
      manufacturerContract.write.dispatchMedicine([gtin, snGR, distributor.account.address]),
      /Medicine is recalled/,
    );
  });

  it("should block EIP-712 authorized dispatch for all safety restriction cases", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);

    // 1. Unit quarantined
    const snUQ = "SN-AUTH-UQ";
    await manufacturerContract.write.registerMedicine([gtin, snUQ, batch, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, snUQ, "Hold"]);
    let auth = await createSignedAuthorization(contract.address, manufacturer, { serialNumber: snUQ, nonce: 7001n });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is quarantined/,
    );

    // 2. Unit recalled
    const snUR = "SN-AUTH-UR";
    await manufacturerContract.write.registerMedicine([gtin, snUR, batch, expiry]);
    await manufacturerContract.write.recallMedicine([gtin, snUR, "Recall"]);
    auth = await createSignedAuthorization(contract.address, manufacturer, { serialNumber: snUR, nonce: 7002n });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is recalled/,
    );

    // 3. Mfr batch quarantined
    const snMQ = "SN-AUTH-MQ";
    const bMQ = "BAT-AUTH-MQ";
    await manufacturerContract.write.registerMedicine([gtin, snMQ, bMQ, expiry]);
    await manufacturerContract.write.quarantineBatchMfr([gtin, bMQ, "Batch Hold"]);
    auth = await createSignedAuthorization(contract.address, manufacturer, { serialNumber: snMQ, batchNumber: bMQ, nonce: 7003n });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is quarantined/,
    );

    // 4. Mfr batch recalled
    const snMR = "SN-AUTH-MR";
    const bMR = "BAT-AUTH-MR";
    await manufacturerContract.write.registerMedicine([gtin, snMR, bMR, expiry]);
    await manufacturerContract.write.recallBatchMfr([gtin, bMR, "Batch Recall"]);
    auth = await createSignedAuthorization(contract.address, manufacturer, { serialNumber: snMR, batchNumber: bMR, nonce: 7004n });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is recalled/,
    );

    // 5. Global batch quarantined
    const snGQ = "SN-AUTH-GQ";
    const bGQ = "BAT-AUTH-GQ";
    await manufacturerContract.write.registerMedicine([gtin, snGQ, bGQ, expiry]);
    await contract.write.emergencyQuarantineBatchGlobal([gtin, bGQ, "Global Hold"]);
    auth = await createSignedAuthorization(contract.address, manufacturer, { serialNumber: snGQ, batchNumber: bGQ, nonce: 7005n });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is quarantined/,
    );

    // 6. Global batch recalled
    const snGR = "SN-AUTH-GR";
    const bGR = "BAT-AUTH-GR";
    await manufacturerContract.write.registerMedicine([gtin, snGR, bGR, expiry]);
    await contract.write.emergencyRecallBatchGlobal([gtin, bGR, "Global Recall"]);
    auth = await createSignedAuthorization(contract.address, manufacturer, { serialNumber: snGR, batchNumber: bGR, nonce: 7006n });
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is recalled/,
    );
  });

  it("should not consume authorization nonce if EIP-712 dispatch fails due to safety restriction", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);
    const sn = "SN-AUTH-NONCE";
    const nonce = 8888n;

    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);
    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Temporary quarantine"]);

    const auth = await createSignedAuthorization(contract.address, manufacturer, {
      serialNumber: sn,
      nonce,
    });

    // Fails because quarantined
    await assert.rejects(
      distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]),
      /Medicine is quarantined/,
    );

    // Nonce must NOT be consumed
    assert.equal(await contract.read.usedNonces([manufacturer.account.address, nonce]), false);

    // Admin lifts quarantine
    await contract.write.liftUnitQuarantine([gtin, sn, "Quarantine lifted"]);

    // Distributor retries using the exact same authorization and signature with nonce 8888n
    await distributorContract.write.dispatchMedicineWithAuthorization([auth.authorization, auth.signature]);

    // Now dispatch succeeds and nonce IS consumed
    const med = await contract.read.getMedicine([gtin, sn]);
    assert.equal(med.status, 2); // Dispatched
    assert.equal(await contract.read.usedNonces([manufacturer.account.address, nonce]), true);
  });

  // -------------------------------------------------------------------------
  // 7. RECEIPT UNDER SAFETY HOLD TESTS
  // -------------------------------------------------------------------------

  it("should permit receipt of in-transit medicine when unit is quarantined after dispatch", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);
    const sn = "SN-RCV-HOLD-Q";

    // 1. Register & dispatch while safe
    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);
    await manufacturerContract.write.dispatchMedicine([gtin, sn, distributor.account.address]);
    let med = await contract.read.getMedicine([gtin, sn]);
    assert.equal(med.status, 2); // Dispatched

    // 2. Quarantine unit while in transit
    await manufacturerContract.write.quarantineMedicine([gtin, sn, "Transit contamination reported"]);

    // 3. Distributor receives unit - MUST succeed
    const hash = await distributorContract.write.receiveMedicine([gtin, sn]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // 4. Status must be Received (3) and receivedAt updated
    med = await contract.read.getMedicine([gtin, sn]);
    assert.equal(med.status, 3); // Received
    assert.ok(med.receivedAt > 0n);

    // 5. MedicineReceivedUnderSafetyHold event emitted
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineReceivedUnderSafetyHold",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.distributor?.toLowerCase(), distributor.account.address.toLowerCase());
    assert.equal(logs[0].args.effectiveSafetyStatus, 1); // Quarantined
    assert.equal(logs[0].args.reason, "Transit contamination reported");

    // 6. Effective safety status remains restricted after receipt
    const [safetyStatus, safetyReason] = await contract.read.getEffectiveSafetyStatus([gtin, sn]);
    assert.equal(safetyStatus, 1);
    assert.equal(safetyReason, "Transit contamination reported");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), false);
  });

  it("should permit receipt of in-transit medicine when batch is recalled after dispatch", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);
    const sn = "SN-RCV-HOLD-R";
    const b = "BAT-RCV-HOLD-R";

    // 1. Register & dispatch while safe
    await manufacturerContract.write.registerMedicine([gtin, sn, b, expiry]);
    await manufacturerContract.write.dispatchMedicine([gtin, sn, distributor.account.address]);

    // 2. Recall manufacturer batch while in transit
    await manufacturerContract.write.recallBatchMfr([gtin, b, "Mandatory recall in transit"]);

    // 3. Distributor receives unit - MUST succeed
    const hash = await distributorContract.write.receiveMedicine([gtin, sn]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // 4. Status must be Received (3)
    const med = await contract.read.getMedicine([gtin, sn]);
    assert.equal(med.status, 3);
    assert.ok(med.receivedAt > 0n);

    // 5. MedicineReceivedUnderSafetyHold emitted with Recalled (2)
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineReceivedUnderSafetyHold",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.effectiveSafetyStatus, 2); // Recalled
    assert.equal(logs[0].args.reason, "Mandatory recall in transit");

    // 6. Effective safety status remains Recalled
    const [safetyStatus, safetyReason] = await contract.read.getEffectiveSafetyStatus([gtin, sn]);
    assert.equal(safetyStatus, 2);
    assert.equal(safetyReason, "Mandatory recall in transit");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), false);
  });

  it("should emit normal MedicineReceived event when received without active safety restriction", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const distributorContract = await getContractFor(contract, distributor);
    const sn = "SN-RCV-SAFE";

    await manufacturerContract.write.registerMedicine([gtin, sn, batch, expiry]);
    await manufacturerContract.write.dispatchMedicine([gtin, sn, distributor.account.address]);

    const hash = await distributorContract.write.receiveMedicine([gtin, sn]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Normal MedicineReceived emitted
    const normalLogs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineReceived",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(normalLogs.length, 1);

    // Safety hold event NOT emitted
    const holdLogs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "MedicineReceivedUnderSafetyHold",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(holdLogs.length, 0);
  });

  // -------------------------------------------------------------------------
  // 8. DEFECT REPORTING TESTS
  // -------------------------------------------------------------------------

  it("should allow admin to report a defect and emit DefectReported event", async function () {
    const contract = await deployAndSetup();
    const b = "BAT-DEF-ADMIN";

    const hash = await contract.write.reportDefect([
      manufacturer.account.address,
      gtin,
      b,
      "Packaging seal defect identified",
      "https://safety.health.gov/evidence/101",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "DefectReported",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.gtin, gtin);
    assert.equal(logs[0].args.batchNumber, b);
    assert.equal(logs[0].args.reason, "Packaging seal defect identified");
    assert.equal(logs[0].args.evidenceURI, "https://safety.health.gov/evidence/101");
    assert.equal(logs[0].args.reporter?.toLowerCase(), admin.account.address.toLowerCase());
  });

  it("should allow active authorized manufacturer to report defect on any batch", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-DEF-MFR";

    const hash = await manufacturerContract.write.reportDefect([
      manufacturer.account.address,
      gtin,
      b,
      "Manufacturer internal quality failure",
      "ipfs://QmDefectEvidenceReport",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "DefectReported",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reporter?.toLowerCase(), manufacturer.account.address.toLowerCase());
  });

  it("should allow historical registering manufacturer to report defect after authorization is revoked", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const b = "BAT-DEF-REVOKED";

    // 1. Register medicine so manufacturer wallet is enrolled in batchReporters
    await manufacturerContract.write.registerMedicine([gtin, "SN-HIST-DEF", b, expiry]);
    const mfrKey = await contract.read.getMfrBatchKey([manufacturer.account.address, gtin, b]);
    assert.equal(await contract.read.batchReporters([mfrKey, manufacturer.account.address]), true);

    // 2. Admin revokes manufacturer authorization
    await contract.write.revokeManufacturer([manufacturer.account.address]);
    assert.equal(await contract.read.manufacturers([manufacturer.account.address]), false);

    // 3. Revoked manufacturer submits defect report for their historical batch - MUST succeed
    const hash = await manufacturerContract.write.reportDefect([
      manufacturer.account.address,
      gtin,
      b,
      "Post-revocation defect discovery",
      "",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "DefectReported",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.reason, "Post-revocation defect discovery");
    assert.equal(logs[0].args.reporter?.toLowerCase(), manufacturer.account.address.toLowerCase());
  });

  it("should reject defect reporting by an unrelated unauthorized outsider", async function () {
    const contract = await deployAndSetup();
    const outsiderContract = await getContractFor(contract, outsider);
    const b = "BAT-DEF-OUTSIDER";

    await assert.rejects(
      outsiderContract.write.reportDefect([
        manufacturer.account.address,
        gtin,
        b,
        "Malicious or unauthorized report",
        "",
      ]),
      /Unauthorized to report defect/,
    );
  });

  it("should reject defect reporting with empty GTIN, batch number, or reason", async function () {
    const contract = await deployAndSetup();

    await assert.rejects(
      contract.write.reportDefect([manufacturer.account.address, "", "B1", "Reason", ""]),
      /GTIN required/,
    );
    await assert.rejects(
      contract.write.reportDefect([manufacturer.account.address, gtin, "", "Reason", ""]),
      /Batch required/,
    );
    await assert.rejects(
      contract.write.reportDefect([manufacturer.account.address, gtin, "B1", "", ""]),
      /Reason required/,
    );
  });

  it("should allow optional empty evidenceURI in reportDefect", async function () {
    const contract = await deployAndSetup();
    const hash = await contract.write.reportDefect([
      manufacturer.account.address,
      gtin,
      "BAT-EMPTY-URI",
      "Defect without evidence URI",
      "",
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: contract.address,
      abi: contract.abi,
      eventName: "DefectReported",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.evidenceURI, "");
  });

  it("should confirm defect reporting does not alter safety status or lifecycle status", async function () {
    const contract = await deployAndSetup();
    const manufacturerContract = await getContractFor(contract, manufacturer);
    const sn = "SN-DEF-STATUS";
    const b = "BAT-DEF-STATUS";

    await manufacturerContract.write.registerMedicine([gtin, sn, b, expiry]);
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), true);

    // Report defect
    await contract.write.reportDefect([
      manufacturer.account.address,
      gtin,
      b,
      "Advisory defect report",
      "evidence",
    ]);

    // Safety and lifecycle status MUST remain completely unaffected
    const [safetyStatus, safetyReason] = await contract.read.getEffectiveSafetyStatus([gtin, sn]);
    assert.equal(safetyStatus, 0); // Normal
    assert.equal(safetyReason, "");
    assert.equal(await contract.read.isMedicineSafe([gtin, sn]), true);

    const med = await contract.read.getMedicine([gtin, sn]);
    assert.equal(med.status, 1); // Registered
  });
});
