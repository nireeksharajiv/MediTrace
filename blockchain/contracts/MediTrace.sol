
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MediTrace is EIP712 {
    address public admin;

    // Authorized participants
    mapping(address => bool) public manufacturers;
    mapping(address => bool) public distributors;

    // Prevent reuse of authorization nonces
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // Medicine lifecycle
    enum Status {
        None,
        Registered,
        Dispatched,
        Received
    }

    // Safety status (Phase 3A)
    enum SafetyStatus {
        Normal,
        Quarantined,
        Recalled
    }

    // =========================================
    // SAFETY RESTRICTION STORES (PHASE 3A)
    // =========================================

    // 1. Individual unit safety stores
    mapping(bytes32 => bool) public unitQuarantined;
    mapping(bytes32 => string) public unitQuarantineReason;
    mapping(bytes32 => bool) public unitRecalled;
    mapping(bytes32 => string) public unitRecallReason;

    // 2. Manufacturer-specific batch safety stores
    mapping(bytes32 => bool) public mfrBatchQuarantined;
    mapping(bytes32 => string) public mfrBatchQuarantineReason;
    mapping(bytes32 => bool) public mfrBatchRecalled;
    mapping(bytes32 => string) public mfrBatchRecallReason;

    // 3. Global batch safety stores
    mapping(bytes32 => bool) public globalBatchQuarantined;
    mapping(bytes32 => string) public globalBatchQuarantineReason;
    mapping(bytes32 => bool) public globalBatchRecalled;
    mapping(bytes32 => string) public globalBatchRecallReason;

    // 4. Historical batch reporters tracking
    mapping(bytes32 => mapping(address => bool)) public batchReporters;

    // Medicine information
    struct Medicine {
        string gtin;
        string serialNumber;
        string batchNumber;
        string expiryDate;
        Status status;
        address registeredBy;
        address dispatchedTo;
        uint256 registeredAt;
        uint256 dispatchedAt;
        uint256 receivedAt;
    }

    // Secure transfer authorization
    struct TransferAuthorization {
        string gtin;
        string serialNumber;
        string batchNumber;
        address manufacturer;
        address distributor;
        uint256 nonce;
        uint256 expiresAt;
    }

    // EIP-712 authorization type hash
    bytes32 public constant TRANSFER_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferAuthorization(string gtin,string serialNumber,string batchNumber,address manufacturer,address distributor,uint256 nonce,uint256 expiresAt)"
        );

    // Medicine storage
    mapping(bytes32 => Medicine) private medicines;

    // Events
    event ManufacturerAuthorized(address indexed manufacturer);
    event DistributorAuthorized(address indexed distributor);

    event ManufacturerRevoked(address indexed manufacturer);
    event DistributorRevoked(address indexed distributor);

    event MedicineRegistered(
        bytes32 indexed medicineId,
        string gtin,
        string serialNumber,
        address indexed manufacturer
    );

    event MedicineDispatched(
        bytes32 indexed medicineId,
        address indexed manufacturer,
        address indexed distributor
    );

    event MedicineReceived(
        bytes32 indexed medicineId,
        address indexed distributor
    );

    event TransferAuthorizationUsed(
        address indexed manufacturer,
        address indexed distributor,
        uint256 nonce
    );

    // Safety events (Phase 3A)
    event MedicineQuarantined(
        bytes32 indexed medicineId,
        string gtin,
        string serialNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event MedicineQuarantineLifted(
        bytes32 indexed medicineId,
        string gtin,
        string serialNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event MedicineRecalled(
        bytes32 indexed medicineId,
        string gtin,
        string serialNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event MfrBatchQuarantined(
        bytes32 indexed mfrBatchKey,
        address indexed manufacturer,
        string gtin,
        string batchNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event MfrBatchQuarantineLifted(
        bytes32 indexed mfrBatchKey,
        address indexed manufacturer,
        string gtin,
        string batchNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event MfrBatchRecalled(
        bytes32 indexed mfrBatchKey,
        address indexed manufacturer,
        string gtin,
        string batchNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event GlobalBatchQuarantined(
        bytes32 indexed globalBatchKey,
        string gtin,
        string batchNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event GlobalBatchQuarantineLifted(
        bytes32 indexed globalBatchKey,
        string gtin,
        string batchNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event GlobalBatchRecalled(
        bytes32 indexed globalBatchKey,
        string gtin,
        string batchNumber,
        string reason,
        address indexed initiator,
        uint256 timestamp
    );

    event MedicineReceivedUnderSafetyHold(
        bytes32 indexed medicineId,
        address indexed distributor,
        uint8 effectiveSafetyStatus,
        string reason,
        uint256 timestamp
    );

    event DefectReported(
        bytes32 indexed mfrBatchKey,
        address indexed reporter,
        string gtin,
        string batchNumber,
        string reason,
        string evidenceURI,
        uint256 timestamp
    );

    // Constructor
    constructor() EIP712("MediTrace", "1") {
        admin = msg.sender;
    }

    // Access control modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }

    modifier onlyManufacturer() {
        require(
            manufacturers[msg.sender],
            "Manufacturer not authorized"
        );
        _;
    }

    modifier onlyDistributor() {
        require(
            distributors[msg.sender],
            "Distributor not authorized"
        );
        _;
    }

    // =========================================
    // ADMIN FUNCTIONS
    // =========================================

    function authorizeManufacturer(address account)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        require(!manufacturers[account], "Already authorized");

        manufacturers[account] = true;

        emit ManufacturerAuthorized(account);
    }

    function authorizeDistributor(address account)
        external
        onlyAdmin
    {
        require(account != address(0), "Invalid address");
        require(!distributors[account], "Already authorized");

        distributors[account] = true;

        emit DistributorAuthorized(account);
    }

    function revokeManufacturer(address account)
        external
        onlyAdmin
    {
        require(manufacturers[account], "Not authorized");

        manufacturers[account] = false;

        emit ManufacturerRevoked(account);
    }

    function revokeDistributor(address account)
        external
        onlyAdmin
    {
        require(distributors[account], "Not authorized");

        distributors[account] = false;

        emit DistributorRevoked(account);
    }

    // =========================================
    // MEDICINE IDENTIFICATION
    // =========================================

    function getMedicineId(
        string memory gtin,
        string memory serialNumber
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(gtin, serialNumber));
    }

    function getMfrBatchKey(
        address manufacturer,
        string memory gtin,
        string memory batchNumber
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(manufacturer, gtin, batchNumber));
    }

    function getGlobalBatchKey(
        string memory gtin,
        string memory batchNumber
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(gtin, batchNumber));
    }

    // =========================================
    // MEDICINE REGISTRATION
    // =========================================

    function registerMedicine(
        string memory gtin,
        string memory serialNumber,
        string memory batchNumber,
        string memory expiryDate
    ) external onlyManufacturer {

        require(bytes(gtin).length > 0, "GTIN required");
        require(bytes(serialNumber).length > 0, "Serial required");
        require(bytes(batchNumber).length > 0, "Batch required");
        require(
            _isValidExpiryDate(expiryDate),
            "Invalid expiry date"
        );
        require(
            !_isExpired(expiryDate),
            "Medicine expired"
        );

        bytes32 mfrBatchKey = getMfrBatchKey(msg.sender, gtin, batchNumber);
        bytes32 globalBatchKey = getGlobalBatchKey(gtin, batchNumber);

        require(
            !mfrBatchRecalled[mfrBatchKey] && !globalBatchRecalled[globalBatchKey],
            "Batch is recalled"
        );
        require(
            !mfrBatchQuarantined[mfrBatchKey] && !globalBatchQuarantined[globalBatchKey],
            "Batch is quarantined"
        );

        bytes32 id = getMedicineId(gtin, serialNumber);

        require(
            medicines[id].status == Status.None,
            "Medicine already registered"
        );

        medicines[id] = Medicine({
            gtin: gtin,
            serialNumber: serialNumber,
            batchNumber: batchNumber,
            expiryDate: expiryDate,
            status: Status.Registered,
            registeredBy: msg.sender,
            dispatchedTo: address(0),
            registeredAt: block.timestamp,
            dispatchedAt: 0,
            receivedAt: 0
        });

        if (!batchReporters[mfrBatchKey][msg.sender]) {
            batchReporters[mfrBatchKey][msg.sender] = true;
        }

        emit MedicineRegistered(
            id,
            gtin,
            serialNumber,
            msg.sender
        );
    }

    // =========================================
    // NORMAL MEDICINE DISPATCH
    // =========================================

    function dispatchMedicine(
        string memory gtin,
        string memory serialNumber,
        address distributor
    ) external onlyManufacturer {

        bytes32 id = getMedicineId(gtin, serialNumber);

        Medicine storage medicine = medicines[id];

        require(
            medicine.status == Status.Registered,
            "Medicine not available for dispatch"
        );

        require(
            !_isExpired(medicine.expiryDate),
            "Medicine expired"
        );

        require(
            medicine.registeredBy == msg.sender,
            "Not the registering manufacturer"
        );

        require(
            distributors[distributor],
            "Distributor not authorized"
        );

        _enforceNotRestricted(
            medicine.registeredBy,
            gtin,
            serialNumber,
            medicine.batchNumber
        );

        medicine.status = Status.Dispatched;
        medicine.dispatchedTo = distributor;
        medicine.dispatchedAt = block.timestamp;

        emit MedicineDispatched(
            id,
            msg.sender,
            distributor
        );
    }

    // =========================================
    // SECURE EIP-712 AUTHORIZED DISPATCH
    // =========================================

    function dispatchMedicineWithAuthorization(
        TransferAuthorization calldata authorization,
        bytes calldata signature
    ) external onlyDistributor {

        // 1. Verify intended distributor
        require(
            authorization.distributor == msg.sender,
            "Wrong distributor"
        );

        // 2. Verify manufacturer authorization
        require(
            manufacturers[authorization.manufacturer],
            "Manufacturer not authorized"
        );

        // 3. Verify authorization expiry
        require(
            authorization.expiresAt >= block.timestamp,
            "Authorization expired"
        );

        // 4. Prevent nonce reuse
        require(
            !usedNonces[authorization.manufacturer][authorization.nonce],
            "Authorization already used"
        );

        // 5. Identify medicine
        bytes32 id = getMedicineId(
            authorization.gtin,
            authorization.serialNumber
        );

        Medicine storage medicine = medicines[id];

        // 6. Verify medicine registration
        require(
            medicine.status == Status.Registered,
            "Medicine not available"
        );

        require(
            !_isExpired(medicine.expiryDate),
            "Medicine expired"
        );

        // 7. Verify registering manufacturer
        require(
            medicine.registeredBy == authorization.manufacturer,
            "Wrong manufacturer"
        );

        // 8. Verify batch number
        require(
            keccak256(bytes(medicine.batchNumber)) ==
            keccak256(bytes(authorization.batchNumber)),
            "Batch mismatch"
        );

        _enforceNotRestricted(
            authorization.manufacturer,
            authorization.gtin,
            authorization.serialNumber,
            authorization.batchNumber
        );

        // 9. Create EIP-712 struct hash
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_AUTHORIZATION_TYPEHASH,
                keccak256(bytes(authorization.gtin)),
                keccak256(bytes(authorization.serialNumber)),
                keccak256(bytes(authorization.batchNumber)),
                authorization.manufacturer,
                authorization.distributor,
                authorization.nonce,
                authorization.expiresAt
            )
        );

        // 10. Create EIP-712 digest
        bytes32 digest = _hashTypedDataV4(structHash);

        // 11. Recover signing address
        address recoveredSigner = ECDSA.recover(
            digest,
            signature
        );

        // 12. Verify manufacturer signature
        require(
            recoveredSigner == authorization.manufacturer,
            "Invalid manufacturer signature"
        );

        // 13. Mark nonce as used
        usedNonces[authorization.manufacturer][authorization.nonce] = true;

        // 14. Update lifecycle status
        medicine.status = Status.Dispatched;
        medicine.dispatchedTo = msg.sender;
        medicine.dispatchedAt = block.timestamp;

        // 15. Emit events
        emit MedicineDispatched(
            id,
            authorization.manufacturer,
            msg.sender
        );

        emit TransferAuthorizationUsed(
            authorization.manufacturer,
            msg.sender,
            authorization.nonce
        );
    }

    // =========================================
    // MEDICINE RECEIPT
    // =========================================

    function receiveMedicine(
        string memory gtin,
        string memory serialNumber
    ) external onlyDistributor {

        bytes32 id = getMedicineId(gtin, serialNumber);

        Medicine storage medicine = medicines[id];

        require(
            medicine.status == Status.Dispatched,
            "Medicine not dispatched"
        );

        require(
            !_isExpired(medicine.expiryDate),
            "Medicine expired"
        );

        require(
            medicine.dispatchedTo == msg.sender,
            "Wrong distributor"
        );

        medicine.status = Status.Received;
        medicine.receivedAt = block.timestamp;

        bytes32 mfrKey = getMfrBatchKey(
            medicine.registeredBy,
            gtin,
            medicine.batchNumber
        );
        bytes32 globalKey = getGlobalBatchKey(gtin, medicine.batchNumber);
        (SafetyStatus safety, string memory safetyReason) = _checkRestriction(
            id,
            mfrKey,
            globalKey
        );

        if (safety != SafetyStatus.Normal) {
            emit MedicineReceivedUnderSafetyHold(
                id,
                msg.sender,
                uint8(safety),
                safetyReason,
                block.timestamp
            );
        } else {
            emit MedicineReceived(id, msg.sender);
        }
    }

    // =========================================
    // MEDICINE VERIFICATION
    // =========================================

    function verifyMedicine(
        string memory gtin,
        string memory serialNumber
    ) external view returns (bool) {

        bytes32 id = getMedicineId(gtin, serialNumber);

        return medicines[id].status != Status.None;
    }

    // =========================================
    // MEDICINE DETAILS
    // =========================================

    function getMedicine(
        string memory gtin,
        string memory serialNumber
    ) external view returns (Medicine memory) {

        bytes32 id = getMedicineId(gtin, serialNumber);

        require(
            medicines[id].status != Status.None,
            "Medicine not found"
        );

        return medicines[id];
    }

    // =========================================
    // SAFETY RESTRICTION MANAGEMENT (PHASE 3A)
    // =========================================

    // 1. Unit safety operations
    function quarantineMedicine(
        string memory gtin,
        string memory serialNumber,
        string memory reason
    ) external {
        _setUnitSafety(gtin, serialNumber, reason, 1);
    }

    function liftUnitQuarantine(
        string memory gtin,
        string memory serialNumber,
        string memory reason
    ) external onlyAdmin {
        _setUnitSafety(gtin, serialNumber, reason, 2);
    }

    function recallMedicine(
        string memory gtin,
        string memory serialNumber,
        string memory reason
    ) external {
        _setUnitSafety(gtin, serialNumber, reason, 3);
    }

    function _setUnitSafety(
        string memory gtin,
        string memory serialNumber,
        string memory reason,
        uint8 action
    ) internal {
        require(bytes(reason).length > 0, "Reason required");
        bytes32 id = getMedicineId(gtin, serialNumber);
        Medicine storage medicine = medicines[id];
        require(medicine.status != Status.None, "Medicine not found");

        if (action == 2) {
            require(msg.sender == admin, "Admin only");
        } else {
            require(
                msg.sender == admin || msg.sender == medicine.registeredBy,
                "Unauthorized"
            );
        }

        if (action == 1) {
            unitQuarantined[id] = true;
            unitQuarantineReason[id] = reason;
            emit MedicineQuarantined(
                id,
                gtin,
                serialNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        } else if (action == 2) {
            require(unitQuarantined[id], "Not quarantined");
            unitQuarantined[id] = false;
            unitQuarantineReason[id] = reason;
            emit MedicineQuarantineLifted(
                id,
                gtin,
                serialNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        } else if (action == 3) {
            unitRecalled[id] = true;
            unitRecallReason[id] = reason;
            emit MedicineRecalled(
                id,
                gtin,
                serialNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        }
    }

    // 2. Manufacturer batch safety operations
    function quarantineBatchMfr(
        string memory gtin,
        string memory batchNumber,
        string memory reason
    ) external onlyManufacturer {
        _setMfrBatchSafety(msg.sender, gtin, batchNumber, reason, 1);
    }

    function liftMfrBatchQuarantine(
        address manufacturer,
        string memory gtin,
        string memory batchNumber,
        string memory reason
    ) external onlyAdmin {
        _setMfrBatchSafety(manufacturer, gtin, batchNumber, reason, 2);
    }

    function recallBatchMfr(
        string memory gtin,
        string memory batchNumber,
        string memory reason
    ) external onlyManufacturer {
        _setMfrBatchSafety(msg.sender, gtin, batchNumber, reason, 3);
    }

    function _setMfrBatchSafety(
        address manufacturer,
        string memory gtin,
        string memory batchNumber,
        string memory reason,
        uint8 action
    ) internal {
        require(bytes(gtin).length > 0, "GTIN required");
        require(bytes(batchNumber).length > 0, "Batch required");
        require(bytes(reason).length > 0, "Reason required");

        if (action == 2) {
            require(msg.sender == admin, "Admin only");
        }

        bytes32 mfrBatchKey = getMfrBatchKey(manufacturer, gtin, batchNumber);

        if (action == 1) {
            mfrBatchQuarantined[mfrBatchKey] = true;
            mfrBatchQuarantineReason[mfrBatchKey] = reason;
            emit MfrBatchQuarantined(
                mfrBatchKey,
                manufacturer,
                gtin,
                batchNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        } else if (action == 2) {
            require(mfrBatchQuarantined[mfrBatchKey], "Not quarantined");
            mfrBatchQuarantined[mfrBatchKey] = false;
            mfrBatchQuarantineReason[mfrBatchKey] = reason;
            emit MfrBatchQuarantineLifted(
                mfrBatchKey,
                manufacturer,
                gtin,
                batchNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        } else if (action == 3) {
            mfrBatchRecalled[mfrBatchKey] = true;
            mfrBatchRecallReason[mfrBatchKey] = reason;
            emit MfrBatchRecalled(
                mfrBatchKey,
                manufacturer,
                gtin,
                batchNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        }
    }

    // 3. Global batch safety operations
    function emergencyQuarantineBatchGlobal(
        string memory gtin,
        string memory batchNumber,
        string memory reason
    ) external onlyAdmin {
        _setGlobalBatchSafety(gtin, batchNumber, reason, 1);
    }

    function liftGlobalBatchQuarantine(
        string memory gtin,
        string memory batchNumber,
        string memory reason
    ) external onlyAdmin {
        _setGlobalBatchSafety(gtin, batchNumber, reason, 2);
    }

    function emergencyRecallBatchGlobal(
        string memory gtin,
        string memory batchNumber,
        string memory reason
    ) external onlyAdmin {
        _setGlobalBatchSafety(gtin, batchNumber, reason, 3);
    }

    function _setGlobalBatchSafety(
        string memory gtin,
        string memory batchNumber,
        string memory reason,
        uint8 action
    ) internal {
        require(bytes(gtin).length > 0, "GTIN required");
        require(bytes(batchNumber).length > 0, "Batch required");
        require(bytes(reason).length > 0, "Reason required");

        bytes32 globalBatchKey = getGlobalBatchKey(gtin, batchNumber);

        if (action == 1) {
            globalBatchQuarantined[globalBatchKey] = true;
            globalBatchQuarantineReason[globalBatchKey] = reason;
            emit GlobalBatchQuarantined(
                globalBatchKey,
                gtin,
                batchNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        } else if (action == 2) {
            require(globalBatchQuarantined[globalBatchKey], "Not quarantined");
            globalBatchQuarantined[globalBatchKey] = false;
            globalBatchQuarantineReason[globalBatchKey] = reason;
            emit GlobalBatchQuarantineLifted(
                globalBatchKey,
                gtin,
                batchNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        } else if (action == 3) {
            globalBatchRecalled[globalBatchKey] = true;
            globalBatchRecallReason[globalBatchKey] = reason;
            emit GlobalBatchRecalled(
                globalBatchKey,
                gtin,
                batchNumber,
                reason,
                msg.sender,
                block.timestamp
            );
        }
    }

    // 4. Historical defect reporting
    function reportDefect(
        address manufacturer,
        string memory gtin,
        string memory batchNumber,
        string memory reason,
        string memory evidenceURI
    ) external {
        require(bytes(gtin).length > 0, "GTIN required");
        require(bytes(batchNumber).length > 0, "Batch required");
        require(bytes(reason).length > 0, "Reason required");

        bytes32 mfrBatchKey = getMfrBatchKey(manufacturer, gtin, batchNumber);

        require(
            msg.sender == admin ||
            manufacturers[msg.sender] ||
            batchReporters[mfrBatchKey][msg.sender],
            "Unauthorized to report defect"
        );

        emit DefectReported(
            mfrBatchKey,
            msg.sender,
            gtin,
            batchNumber,
            reason,
            evidenceURI,
            block.timestamp
        );
    }

    // 5. Effective safety status and query
    function getEffectiveSafetyStatus(
        string memory gtin,
        string memory serialNumber
    ) public view returns (SafetyStatus status, string memory reason) {
        bytes32 id = getMedicineId(gtin, serialNumber);
        Medicine storage medicine = medicines[id];
        require(medicine.status != Status.None, "Medicine not found");

        bytes32 mfrKey = getMfrBatchKey(medicine.registeredBy, gtin, medicine.batchNumber);
        bytes32 globalKey = getGlobalBatchKey(gtin, medicine.batchNumber);

        return _checkRestriction(id, mfrKey, globalKey);
    }

    function isMedicineSafe(
        string memory gtin,
        string memory serialNumber
    ) external view returns (bool) {
        (SafetyStatus status, ) = getEffectiveSafetyStatus(gtin, serialNumber);
        return status == SafetyStatus.Normal;
    }

    // 6. Internal restriction check helpers
    function _checkRestriction(
        bytes32 id,
        bytes32 mfrKey,
        bytes32 globalKey
    ) internal view returns (SafetyStatus, string memory) {
        // Precedence: Recalls take precedence over Quarantines
        if (unitRecalled[id]) {
            return (SafetyStatus.Recalled, unitRecallReason[id]);
        }
        if (mfrBatchRecalled[mfrKey]) {
            return (SafetyStatus.Recalled, mfrBatchRecallReason[mfrKey]);
        }
        if (globalBatchRecalled[globalKey]) {
            return (SafetyStatus.Recalled, globalBatchRecallReason[globalKey]);
        }
        if (unitQuarantined[id]) {
            return (SafetyStatus.Quarantined, unitQuarantineReason[id]);
        }
        if (mfrBatchQuarantined[mfrKey]) {
            return (SafetyStatus.Quarantined, mfrBatchQuarantineReason[mfrKey]);
        }
        if (globalBatchQuarantined[globalKey]) {
            return (SafetyStatus.Quarantined, globalBatchQuarantineReason[globalKey]);
        }
        return (SafetyStatus.Normal, "");
    }

    function _enforceNotRestricted(
        address manufacturer,
        string memory gtin,
        string memory serialNumber,
        string memory batchNumber
    ) internal view {
        bytes32 id = getMedicineId(gtin, serialNumber);
        bytes32 mfrKey = getMfrBatchKey(manufacturer, gtin, batchNumber);
        bytes32 globalKey = getGlobalBatchKey(gtin, batchNumber);

        (SafetyStatus status, ) = _checkRestriction(id, mfrKey, globalKey);
        require(status != SafetyStatus.Recalled, "Medicine is recalled");
        require(status != SafetyStatus.Quarantined, "Medicine is quarantined");
    }

    // =========================================
    // EXPIRY DATE VALIDATION & ENFORCEMENT
    // Expected format: YYYY-MM-DD
    // Validates calendar validity, leap years, and temporal expiry.
    // =========================================

    function isValidExpiryDate(
        string memory date
    ) external pure returns (bool) {
        return _isValidExpiryDate(date);
    }

    function expiryToEndOfDayTimestamp(
        string memory date
    ) external pure returns (uint256) {
        require(_isValidExpiryDate(date), "Invalid expiry date");
        return _expiryToEndOfDayTimestamp(date);
    }

    function isMedicineExpired(
        string memory gtin,
        string memory serialNumber
    ) external view returns (bool) {
        bytes32 id = getMedicineId(gtin, serialNumber);
        require(medicines[id].status != Status.None, "Medicine not found");
        return _isExpired(medicines[id].expiryDate);
    }

    function _isExpired(
        string memory expiryDate
    ) internal view returns (bool) {
        return block.timestamp > _expiryToEndOfDayTimestamp(expiryDate);
    }

    function _expiryToEndOfDayTimestamp(
        string memory date
    ) internal pure returns (uint256) {
        bytes memory d = bytes(date);

        uint256 year = (uint256(uint8(d[0])) - 48) * 1000 +
            (uint256(uint8(d[1])) - 48) * 100 +
            (uint256(uint8(d[2])) - 48) * 10 +
            (uint256(uint8(d[3])) - 48);

        uint256 month = (uint256(uint8(d[5])) - 48) * 10 +
            (uint256(uint8(d[6])) - 48);

        uint256 day = (uint256(uint8(d[8])) - 48) * 10 +
            (uint256(uint8(d[9])) - 48);

        // Days before year since 1970-01-01 (1969/4=492, 1969/100=19, 1969/400=4)
        uint256 daysBeforeYear = (year - 1970) * 365 +
            ((year - 1) / 4 - 492) -
            ((year - 1) / 100 - 19) +
            ((year - 1) / 400 - 4);

        // Days before month in a standard non-leap year
        uint256 daysBeforeMonth;
        if (month == 1) daysBeforeMonth = 0;
        else if (month == 2) daysBeforeMonth = 31;
        else if (month == 3) daysBeforeMonth = 59;
        else if (month == 4) daysBeforeMonth = 90;
        else if (month == 5) daysBeforeMonth = 120;
        else if (month == 6) daysBeforeMonth = 151;
        else if (month == 7) daysBeforeMonth = 181;
        else if (month == 8) daysBeforeMonth = 212;
        else if (month == 9) daysBeforeMonth = 243;
        else if (month == 10) daysBeforeMonth = 273;
        else if (month == 11) daysBeforeMonth = 304;
        else daysBeforeMonth = 334;

        bool isLeap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        if (isLeap && month > 2) {
            daysBeforeMonth += 1;
        }

        uint256 totalDays = daysBeforeYear + daysBeforeMonth + (day - 1);

        // 23:59:59 UTC of the stated calendar day
        return (totalDays * 86400) + 86399;
    }

    function _isValidExpiryDate(
        string memory date
    ) internal pure returns (bool) {

        bytes memory d = bytes(date);

        if (d.length != 10) {
            return false;
        }

        if (d[4] != "-" || d[7] != "-") {
            return false;
        }

        for (uint256 i = 0; i < d.length; i++) {

            if (i == 4 || i == 7) {
                continue;
            }

            if (d[i] < "0" || d[i] > "9") {
                return false;
            }
        }

        uint256 year = (uint256(uint8(d[0])) - 48) * 1000 +
            (uint256(uint8(d[1])) - 48) * 100 +
            (uint256(uint8(d[2])) - 48) * 10 +
            (uint256(uint8(d[3])) - 48);

        uint256 month = (uint256(uint8(d[5])) - 48) * 10 +
            (uint256(uint8(d[6])) - 48);

        uint256 day = (uint256(uint8(d[8])) - 48) * 10 +
            (uint256(uint8(d[9])) - 48);

        if (year < 1970 || year > 9999) {
            return false;
        }

        if (month < 1 || month > 12) {
            return false;
        }

        bool isLeap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);

        uint256 maxDays;
        if (month == 2) {
            maxDays = isLeap ? 29 : 28;
        } else if (month == 4 || month == 6 || month == 9 || month == 11) {
            maxDays = 30;
        } else {
            maxDays = 31;
        }

        if (day < 1 || day > maxDays) {
            return false;
        }

        return true;
    }
}
