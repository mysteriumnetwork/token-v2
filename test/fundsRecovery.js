const BN = require('bn.js');
const chai = require('chai');
chai.use(require('chai-as-promised'))
chai.use(require('chai-bn')(BN))
chai.should()
const expect = chai.expect

const MystToken = artifacts.require("MystToken")
const OriginalMystToken = artifacts.require("OriginalMystToken")

const ZeroAddress = '0x0000000000000000000000000000000000000000'
const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')  // In original contract MYST had 8 decimals
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Multiplier = new BN('10000000000')
const Zero = new BN(0)

contract('Test funds recovery', ([upgradeMaster, addressOne, addressTwo, addressThree, ...otherAccounts]) => {
    let token, originalToken, tokenSupply
    before(async () => {
        originalToken = await OriginalMystToken.new()
        await originalToken.mint(addressOne, OneToken)
        tokenSupply = await originalToken.totalSupply()

        token = await MystToken.new(originalToken.address)

        // Enable token migration
        await originalToken.setUpgradeAgent(token.address)
    })

    // NOTE In original contract MYST had 8 decimals, new MYST will
    // have 18 decimals same as Ether.
    it('should migrate tokens from original contract', async () => {
        await originalToken.upgrade(OneToken, { from: addressOne })
        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(OneEther)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply.mul(Multiplier))
        tokenSupply = tokenSupply.mul(Multiplier)
    })

    it('should transfer tokens into token smart contract', async () => {
        await token.transfer(token.address, OneToken, { from: addressOne })
        expect(await token.balanceOf(token.address)).to.be.bignumber.equal(OneToken)
    })

    it('should reject token recovery', async () => {
        await token.claimTokens(token.address).should.be.rejected
    })

    it('only upgrade master can set funds destination', async () => {
        await token.setFundsDestination(addressTwo, { from: addressOne }).should.be.rejected
        expect(await token.getFundsDestination()).to.be.equal(ZeroAddress)

        await token.setFundsDestination(addressTwo, { from: upgradeMaster })
        expect(await token.getFundsDestination()).to.be.equal(addressTwo)
    })

    it('should sucessfully claim tokens', async () => {
        const tokenToClaim = await token.balanceOf(token.address)

        expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(Zero)
        await token.claimTokens(token.address, { from: addressThree })
        expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(tokenToClaim)
        expect(await token.balanceOf(token.address)).to.be.bignumber.equal(Zero)
    })

})
