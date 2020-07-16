const erc1820 = require("../scripts/erc1820Deploy")

const SafeMathLib = artifacts.require("SafeMathLib")
const OriginalMystToken = artifacts.require("OriginalMystToken")


module.exports = async function (deployer, network, accounts) {
    // Deploy ERC1820 Pseudo-introspection Registry Contract.
    await erc1820.deploy(web3, accounts[0])

    // Link SafeMath with OriginalToken. This is needed for tests.
    await deployer.deploy(SafeMathLib)
    await deployer.link(SafeMathLib, [OriginalMystToken])
}