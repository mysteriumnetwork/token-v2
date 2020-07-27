const BN = require('bn.js');
const chai = require('chai');
chai.use(require('chai-as-promised'))
chai.use(require('chai-bn')(BN))
chai.should()
const expect = chai.expect

const MystToken = artifacts.require("MystToken")
const OriginalMystToken = artifacts.require("OriginalMystToken")
const RandomContract = artifacts.require("RandomContract")
const RandomERC777ReceiverContract = artifacts.require("RandomERC777ReceiverContract")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')  // In original contract MYST had 8 decimals
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Multiplier = new BN('10000000000')                       // New token has 18 zeros instead of 8

const Zero = new BN(0)
const Max = new BN('115792089237316195423570985008687907853269984665640564039457584007913129639935') // uint256(-1)

contract('Test ERC20 functionality', ([owner, addressOne, addressTwo, addressThree, ...otherAccounts]) => {
    let token, originalToken, tokenSupply
    before(async () => {
        originalToken = await OriginalMystToken.new()
        await originalToken.mint(owner, OneToken)
        await originalToken.mint(addressOne, OneToken)
        await originalToken.mint(addressTwo, OneToken)
        tokenSupply = await originalToken.totalSupply()

        token = await MystToken.new(originalToken.address)

        // Enable token migration
        await originalToken.setUpgradeAgent(token.address)
    })

    it('has a name', async function () {
        expect(await token.name()).to.equal('Mysterium');
    });

    it('has a symbol', async function () {
        expect(await token.symbol()).to.equal('MYST');
    });

    it('has 18 decimals', async function () {
        expect(await token.decimals()).to.be.bignumber.equal('18');
    });

    it('should have 0 total supply', async () => {
        expect(await token.totalSupply()).to.be.bignumber.equal(Zero)
    })

    // NOTE In original contract MYST had 8 decimals, new MYST will
    // have 18 decimals same as Ether.
    it('should migrate tokens from original contract', async () => {
        await originalToken.upgrade(OneToken, { from: owner })
        expect(await token.balanceOf(owner)).to.be.bignumber.equal(OneEther)

        await originalToken.upgrade(OneToken, { from: addressOne })
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(OneEther)

        await originalToken.upgrade(OneToken, { from: addressTwo })
        expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(OneEther)

        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply.mul(Multiplier))
        tokenSupply = tokenSupply.mul(Multiplier)
    });

    it('should successfully transfer tokens', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const amount = new BN('1000')

        await token.transfer(addressThree, amount, { from: addressOne })

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(amount)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('should reject transfering more tokens than holder has', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const amount = OneEther

        await token.transfer(addressThree, amount, { from: addressOne }).should.be.rejected
    })

    it('should successfully transfer into non ERC777 receiver smart contract', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const receiver = (await RandomContract.new()).address
        const amount = new BN('1000')

        await token.transfer(receiver, amount, { from: addressOne })

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(receiver)).to.be.bignumber.equal(amount)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('should successfully transfer into and touch tokens received of ERC777 receiver smart contract', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const receiver = await RandomERC777ReceiverContract.new()
        const amount = new BN('1000')

        await token.transfer(receiver.address, amount, { from: addressOne })

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(receiver.address)).to.be.bignumber.equal(amount)
        expect(await receiver.receivedAmount()).to.be.bignumber.equal(amount)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('should properly set allowance', async () => {
        expect(await token.allowance(addressOne, owner)).to.be.bignumber.equal(Zero)
        await token.approve(owner, OneEther, { from: addressOne })
        expect(await token.allowance(addressOne, owner)).to.be.bignumber.equal(OneEther)
    })

    it('should allow transfer tokens from holders account if there is allowance set', async () => {
        const initialOwnerBalance = await token.balanceOf(owner)
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const initialAddressThreeeBalance = await token.balanceOf(addressThree)
        const initialAllowance = await token.allowance(addressOne, owner)

        const amount = new BN('100')
        await token.transferFrom(addressOne, addressThree, amount, { from: owner })

        expect(await token.balanceOf(owner)).to.be.bignumber.equal(initialOwnerBalance)
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(initialAddressThreeeBalance.add(amount))

        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)

        expect(await token.allowance(addressOne, owner)).to.be.bignumber.equal(initialAllowance.sub(amount))
    })

    it('should fail transfering from holder address if there is no allowance set', async () => {
        const amount = new BN('100')

        expect(await token.allowance(addressOne, addressTwo)).to.be.bignumber.equal(Zero)
        await token.transferFrom(addressOne, addressThree, amount, { from: addressTwo }).should.be.rejected
    })

    it('should decrease allowance', async () => {
        const newAllowance = new BN('777')

        await token.approve(owner, newAllowance, { from: addressOne })

        expect(await token.allowance(addressOne, owner)).to.be.bignumber.equal(newAllowance)
    })

    it('should fail transfering from holder address if there is not enough allowance', async () => {
        const allowance = await token.allowance(addressOne, owner)
        const amount = OneEther

        expect(allowance).to.be.bignumber.lessThan(amount)
        await token.transferFrom(addressOne, owner, amount, { from: owner }).should.be.rejected
    })

    it('max allowance should never be changed during transferFrom', async () => {
        const initialOwnerBalance = await token.balanceOf(owner)
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const initialAddressThreeeBalance = await token.balanceOf(addressThree)
        const initialAllowance = await token.allowance(addressOne, owner)

        await token.approve(owner, Max, { from: addressOne })
        expect(await token.allowance(addressOne, owner)).to.be.bignumber.equal(Max)

        const amount = new BN('876')
        await token.transferFrom(addressOne, addressThree, amount, { from: owner })

        expect(await token.balanceOf(owner)).to.be.bignumber.equal(initialOwnerBalance)
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(initialAddressThreeeBalance.add(amount))

        // Allowance should be not changed
        expect(await token.allowance(addressOne, owner)).to.be.bignumber.equal(Max)
    })

})
