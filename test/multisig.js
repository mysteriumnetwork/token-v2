const BN = require('bn.js');
const chai = require('chai');
chai.use(require('chai-as-promised'))
chai.use(require('chai-bn')(BN))
chai.should()
const expect = chai.expect

const MystToken = artifacts.require("MystToken")
const OriginalMystToken = artifacts.require("OriginalMystToken")
const Multisig = artifacts.require("Multisig")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')  // In original contract MYST had 8 decimals
const Multiplier = new BN('10000000000')                       // New token has 18 zeros instead of 8
const Empty = Buffer.from('')

const states = {
    unknown: new BN(0),
    notAllowed: new BN(1),
    waitingForAgent: new BN(2),
    readyToUpgrade: new BN(3),
    upgrading: new BN(4),
    completed: new BN(5)
}

contract('Migration via mulisigs', ([txMaker, addressOne, addressTwo, addressThree, ...otherAddresses]) => {
    let token, originalToken, multisig
    before(async () => {
        multisig = await Multisig.new()

        originalToken = await OriginalMystToken.new()
        await originalToken.mint(multisig.address, OneToken)

        token = await MystToken.new(originalToken.address)
    })

    it('should be possible to transfer original token via multisig', async () => {
        const initialMultisigBalance = await originalToken.balanceOf(multisig.address)
        const amount = new BN(20)
        const data = Buffer.from('a9059cbb000000000000000000000000' + addressOne.slice(2) + '0000000000000000000000000000000000000000000000000000000000000014', 'hex')

        await multisig.executeTransaction(originalToken.address, 0, data)

        expect(await originalToken.balanceOf(addressOne)).to.be.bignumber.equal(amount)
        expect(await originalToken.balanceOf(multisig.address)).to.be.bignumber.equal(initialMultisigBalance.sub(amount))
    })

    it('should enable token migration', async () => {
        await originalToken.setUpgradeAgent(token.address)
        expect(await originalToken.getUpgradeState()).to.be.bignumber.equal(states.readyToUpgrade)
    })

    it('should migrate addressOne tokens', async () => {
        const amount = await originalToken.balanceOf(addressOne)
        await originalToken.upgrade(amount, { from: addressOne })
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(amount.mul(Multiplier))
    })

    it('should properly migrate multisig tokens', async () => {
        const initialMultisigBalance = await originalToken.balanceOf(multisig.address)
        const originalTokenSupply = await originalToken.totalSupply()
        const initialTotalSupply = await token.totalSupply()
        const amount = new BN(20)

        // 0x45977d03 is a upgrade function call
        const data = Buffer.from('45977d03' + '0000000000000000000000000000000000000000000000000000000000000014', 'hex')

        // Call token upgrade function
        await multisig.executeTransaction(originalToken.address, 0, data)

        // Check if tokens were migrated properly
        expect(await originalToken.balanceOf(multisig.address)).to.be.bignumber.equal(initialMultisigBalance.sub(amount))
        expect(await token.balanceOf(multisig.address)).to.be.bignumber.equal(amount.mul(Multiplier))
        expect(await originalToken.totalSupply()).to.be.bignumber.equal(originalTokenSupply.sub(amount))

        // New token will have 18 zeros, so we have use `Multiplier`to compare
        expect(await token.totalSupply()).to.be.bignumber.equal(initialTotalSupply.add(amount.mul(Multiplier)))
    })

    it('should be possible to transfer migrated tokens via multisig', async () => {
        const initialMultisigBalance = await token.balanceOf(multisig.address)
        const amount = new BN(20)
        const data = Buffer.from('a9059cbb000000000000000000000000' + addressTwo.slice(2) + '0000000000000000000000000000000000000000000000000000000000000014', 'hex')

        await multisig.executeTransaction(token.address, 0, data)

        expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(amount)
        expect(await token.balanceOf(multisig.address)).to.be.bignumber.equal(initialMultisigBalance.sub(amount))
    })

    it('multisig should get token transfers', async () => {
        const multisigBalance = await token.balanceOf(multisig.address)
        const amount = new BN(20)

        await token.transfer(multisig.address, amount, { from: addressOne })
        expect(await token.balanceOf(multisig.address)).to.be.bignumber.equal(multisigBalance.add(amount))
    })

    it('not prepared multisig should reject ERC777 send', async () => {
        const multisigBalance = await token.balanceOf(multisig.address)
        const amount = new BN(20)

        await token.send(multisig.address, amount, Empty, { from: addressTwo }).should.be.rejected
        expect(await token.balanceOf(multisig.address)).to.be.bignumber.equal(multisigBalance)
    })
})
