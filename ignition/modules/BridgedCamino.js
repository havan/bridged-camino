// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BridgedCaminoV1Module", (m) => {
    // FIXME: Use proxy

    const bridgedCaminoV1 = m.contract("BridgedCaminoV1");

    return { bridgedCaminoV1 };
});
