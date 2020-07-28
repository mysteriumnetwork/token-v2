const BN = require('bn.js');
const chai = require('chai');
chai.use(require('chai-as-promised'))
chai.use(require('chai-bn')(BN))
chai.should()
const expect = chai.expect

const MystToken = artifacts.require("MystToken")
const NextToken = artifacts.require("NextToken")
const OriginalMystToken = artifacts.require("OriginalMystToken")
const RandomContract = artifacts.require("RandomContract")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')  // In original contract MYST had 8 decimals
const HalfToken = web3.utils.toWei(new BN('50000000'), 'wei')
const Multiplier = new BN('10000000000')                       // New token has 18 zeros instead of 8
const Zero = new BN(0)

const states = {
    unknown: new BN(0),
    notAllowed: new BN(1),
    waitingForAgent: new BN(2),
    readyToUpgrade: new BN(3),
    upgrading: new BN(4),
    completed: new BN(5)
}

contract('Original to new token migration', ([txMaker, addressOne, addressTwo, addressThree, ...otherAddresses]) => {
    let token, originalToken, tokenSupply
    before(async () => {
        originalToken = await OriginalMystToken.new()
        await originalToken.mint(addressOne, OneToken)
        await originalToken.mint(addressTwo, OneToken)
        await originalToken.mint(addressThree, OneToken)
        tokenSupply = await originalToken.totalSupply()

        token = await MystToken.new(originalToken.address)
    })

    it('should fail migration when it is not enabled', async () => {
        await token.upgrade(await token.balanceOf(addressOne), { from: addressOne }).should.be.rejected
    })

    it('should enable token migration', async () => {
        const initialUpgradeState = await originalToken.getUpgradeState()
        expect(initialUpgradeState).to.be.bignumber.equal(states.waitingForAgent)

        await originalToken.setUpgradeAgent(token.address)
        expect(await originalToken.upgradeAgent()).to.be.equal(token.address)
        expect(await originalToken.getUpgradeState()).to.be.bignumber.equal(states.readyToUpgrade)
    })

    it('should properly migrate tokens', async () => {
        const addressOneBalance = await originalToken.balanceOf(addressOne)
        await originalToken.upgrade(addressOneBalance, { from: addressOne })
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(addressOneBalance.mul(Multiplier))
        expect(await originalToken.balanceOf(addressOne)).to.be.bignumber.equal(Zero)

        const expectedTotalSupply = tokenSupply.sub(addressOneBalance)
        tokenSupply = await originalToken.totalSupply()
        expect(tokenSupply).to.be.bignumber.equal(expectedTotalSupply)

        // New token will have 18 zeros, so we have use `Multiplier`to compare
        expect(await token.totalSupply()).to.be.bignumber.equal(addressOneBalance.mul(Multiplier))

        const upgradeState = await originalToken.getUpgradeState()
        expect(upgradeState).to.be.bignumber.equal(states.upgrading)
    })

    it('should fail migration', async () => {
        const initialOriginalTokenSupply = await originalToken.totalSupply()
        const initialTokenSupply = await token.totalSupply()

        // Should fail because there are no tokens in addressOne
        await originalToken.upgrade(new BN(0), { from: addressOne }).should.be.rejected

        // Should fail when trying to migrate more than user has
        const amount = OneToken.add(OneToken)
        expect(await originalToken.balanceOf(addressTwo)).to.be.bignumber.lessThan(amount)
        await originalToken.upgrade(amount, { from: addressTwo }).should.be.rejected

        // Token supply should stay untouched
        initialOriginalTokenSupply.should.be.bignumber.equal(await originalToken.totalSupply())
        initialTokenSupply.should.be.bignumber.equal(await token.totalSupply())
    })

    it('should migrate properly in two phases', async () => {
        const initialBalance = await originalToken.balanceOf(addressThree)

        // First migration phase
        await originalToken.upgrade(HalfToken, { from: addressThree })
        expect(await originalToken.balanceOf(addressThree)).to.be.bignumber.equal(initialBalance.sub(HalfToken))

        // Second migration phase
        await originalToken.upgrade(HalfToken, { from: addressThree })
        expect(await originalToken.balanceOf(addressThree)).to.be.bignumber.equal(Zero)

        // Holder should have all his tokens on new token
        expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(initialBalance.mul(Multiplier))

        // No more tokens
        await originalToken.upgrade(HalfToken, { from: addressThree }).should.be.rejected
    })

    it('should fail setting upgrade agent while in upgrading stage', async () => {
        const nextToken = await MystToken.new(token.address)
        await originalToken.setUpgradeAgent(nextToken.address).should.be.rejected
    })

    it('should fail when minting tokens not via upgrade procedure', async () => {
        await token.upgradeFrom(addressTwo, 1).should.be.rejected
    })

    it('all tokens should be moved after last address will finish migration', async () => {
        const amount = await originalToken.balanceOf(addressTwo)
        await originalToken.upgrade(amount, { from: addressTwo })
        expect(await originalToken.balanceOf(addressTwo)).to.be.bignumber.equal(Zero)
        expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(amount.mul(Multiplier))

        // Token supply of original token should be zero
        expect(await originalToken.totalSupply()).to.be.bignumber.equal(Zero)

        // New token total supply should be equal original token supply
        const originalSupply = await token.originalSupply()
        expect(originalSupply.mul(Multiplier)).to.be.bignumber.equal(await token.totalSupply())
    })
})

contract('Migration of new token', ([txMaker, addressOne, addressTwo, addressThree, ...otherAddresses]) => {
    let originalToken, token, nextToken, tokenSupply, randomContract
    before(async () => {
        originalToken = await OriginalMystToken.new()
        await originalToken.mint(addressOne, OneToken)
        await originalToken.mint(addressTwo, OneToken)
        tokenSupply = await originalToken.totalSupply()

        token = await MystToken.new(originalToken.address)
    })

    it('should migrate from original(ERC20) to current (ERC20+permit) token', async () => {
        // Enable token migration for original ERC20 token
        await originalToken.setUpgradeAgent(token.address)

        // Migrate tokens into ERC777 token
        const addressOneBalance = await originalToken.balanceOf(addressOne)
        await originalToken.upgrade(addressOneBalance, { from: addressOne })

        const addressTwoBalance = await originalToken.balanceOf(addressTwo)
        await originalToken.upgrade(addressTwoBalance, { from: addressTwo })

        // Recheck token balances
        addressOneBalance.mul(Multiplier).should.be.bignumber.equal(await token.balanceOf(addressOne))
        addressTwoBalance.mul(Multiplier).should.be.bignumber.equal(await token.balanceOf(addressTwo))
        // addressThreeBalance.mul(Multiplier).should.be.bignumber.equal(await token.balanceOf(addressThree))

        expect(tokenSupply.mul(Multiplier)).to.be.bignumber.equal(await token.totalSupply())
    })

    it('should fail migration when it is not enabled', async () => {
        await token.upgrade(await token.balanceOf(addressOne), { from: addressOne }).should.be.rejected
    })

    it('should enable token migration for NEW token', async () => {
        const initialUpgradeState = await token.getUpgradeState()
        initialUpgradeState.should.be.bignumber.equal(states.waitingForAgent)

        nextToken = await NextToken.new(token.address)
        await token.setUpgradeAgent(nextToken.address)
        expect(await token.upgradeAgent()).to.be.equal(nextToken.address)

        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.readyToUpgrade)
    })

    it('should migrate tokens via upgrade function', async () => {
        const addressOneBalance = await token.balanceOf(addressOne)
        await token.upgrade(addressOneBalance, { from: addressOne })
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(Zero)
        expect(await nextToken.balanceOf(addressOne)).to.be.bignumber.equal(addressOneBalance)

        const expectedTotalSupply = tokenSupply.mul(Multiplier).sub(addressOneBalance)
        expect(await token.totalSupply()).to.be.bignumber.equal(expectedTotalSupply)

        const nextTokenSupply = await nextToken.totalSupply()
        expect(nextTokenSupply).to.be.bignumber.equal(addressOneBalance)

        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.upgrading)
    })

    it('should be possible to exchange tokens while migration in progress', async () => {
        randomContract = await RandomContract.new()

        const upgradeState = await token.getUpgradeState()
        expect(upgradeState).to.be.bignumber.equal(states.upgrading)

        const amountToSend = await token.balanceOf(addressTwo)
        await token.transfer(randomContract.address, amountToSend, { from: addressTwo })
        expect(await token.balanceOf(randomContract.address)).to.be.bignumber.equal(amountToSend)
        expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(Zero)
    })

    it('should fail settling upgrade agent while in upgrading stage', async () => {
        const tokenX = await MystToken.new(token.address)
        await token.setUpgradeAgent(tokenX.address).should.be.rejected
    })

    it('all tokens should be moved after last address will finish migration', async () => {
        const amount = await token.balanceOf(randomContract.address)
        await randomContract.move(token.address, addressThree, amount)  // we're using function move which will simply use erc777 send
        await token.upgrade(amount, { from: addressThree })

        expect(await token.totalSupply()).to.be.bignumber.equal(Zero)
        expect(await token.getUpgradeState()).to.be.bignumber.equal(states.completed)

        // New token total supply should be equal original token supply
        const originalSupply = await nextToken.originalSupply()
        originalSupply.should.be.bignumber.equal(await nextToken.totalSupply())
    })
})
