
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
});
