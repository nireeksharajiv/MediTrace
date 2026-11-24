
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
    );
  });
});
