
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  const contractAddress =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  // Connect to the deployed MediTrace contract
  const contract = await viem.getContractAt(
    "contracts/MediTrace.sol:MediTrace",
    contractAddress
  );

  // Read admin address
  const admin = await contract.read.admin();

  // Read blockchain network ID
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  console.log("\n===== MEDiTRACE DEPLOYMENT CHECK =====");

  console.log("Network Chain ID:", chainId);
  console.log("Contract Address:", contractAddress);
  console.log("Admin Address:", admin);

  console.log("\nSUCCESS: MediTrace contract is accessible!");
}

main().catch((error) => {
  console.error("\nDeployment check failed:", error);
  process.exitCode = 1;
});
