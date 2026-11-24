
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MediTraceModule", (m) => {
  const mediTrace = m.contract(
    "contracts/MediTrace.sol:MediTrace"
  );

  return { mediTrace };
});
