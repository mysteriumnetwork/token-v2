// const { keccak256, defaultAbiCoder, toUtf8Bytes } = require('ethers').utils
const { ecsign } = require('ethereumjs-util')
const { hexlify } = require('ethers').utils
const { MaxUint256 } = require('ethers').constants
const BN = require('bn.js');
const chai = require('chai');
chai.use(require('chai-as-promised'))
chai.use(require('chai-bn')(BN))
chai.should()
const expect = chai.expect

const { getApprovalDigest, getDomainSeparator, generateWallet, PERMIT_TYPEHASH } = require('./utils')

const MystToken = artifacts.require("MystToken")
const OriginalMystToken = artifacts.require("OriginalMystToken")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')  // In original contract MYST had 8 decimals
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Multiplier = new BN('10000000000')                       // New token has 18 zeros instead of 8
const Zero = new BN(0)
const Max = new BN('115792089237316195423570985008687907853269984665640564039457584007913129639935') // uint256(-1)

// Uses same priveKey as expected unlocked first account in ganache
const wallet = generateWallet(Buffer.from('45bb96530f3d1972fdcd2005c1987a371d0b6d378b77561c6beeaca27498f46b', 'hex'))

contract('Test permit function', ([walletAddress, txMaker, addressTwo, addressThree, ...otherAddresses]) => {
    let token, originalToken
    before(async () => {
        originalToken = await OriginalMystToken.new()
        await originalToken.mint(wallet.address, OneToken)
        // await originalToken.mint(addressTwo, OneToken)
        // await originalToken.mint(addressThree, OneToken)
        tokenSupply = await originalToken.totalSupply()

        token = await MystToken.new(originalToken.address)

        // Enable token migration
        await originalToken.setUpgradeAgent(token.address)
    })

    // NOTE In original contract MYST had 8 decimals, new MYST will
    // have 18 decimals same as Ether.
    it('should migrate tokens from original contract', async () => {
        await originalToken.upgrade(OneToken, { from: walletAddress })
        expect(await token.balanceOf(walletAddress)).to.be.bignumber.equal(OneEther)


        // await originalToken.upgrade(OneToken, { from: addressTwo })
        // expect(await token.balanceOf(addressTwo)).to.be.bignumber.equal(OneEther)

        // await originalToken.upgrade(OneToken, { from: addressThree })
        // expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(OneEther)

        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply.mul(Multiplier))
        tokenSupply = tokenSupply.mul(Multiplier)
    })

    it('should have proper DOMAIN_SEPARATOR and PERMIT_TYPEHASH', async () => {
        const name = await token.name()
        expect(await token.DOMAIN_SEPARATOR()).to.eq(getDomainSeparator(name, token.address))
        expect(await token.PERMIT_TYPEHASH()).to.eq(PERMIT_TYPEHASH)
    })

    it('should allow to set operator and max allowance using permit function', async () => {
        expect(await token.allowance(walletAddress, txMaker)).to.be.bignumber.equal(Zero)
        expect(await token.isOperatorFor(txMaker, walletAddress)).to.be.false

        const nonce = await token.nonces(wallet.address)
        const expiry = MaxUint256
        const digest = await getApprovalDigest(
            token,
            { holder: wallet.address, spender: txMaker, allowed: true },
            nonce,
            expiry
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), wallet.privKey)
        await token.permit(wallet.address, txMaker, expiry, true, v, hexlify(r), hexlify(s), { from: walletAddress })

        expect(await token.allowance(walletAddress, txMaker)).to.be.bignumber.equal(Max)
        expect(await token.isOperatorFor(txMaker, walletAddress)).to.be.true
    })

    it('should revoke operator using permit function', async () => {
        expect(await token.allowance(walletAddress, txMaker)).to.be.bignumber.equal(Max)
        expect(await token.isOperatorFor(txMaker, walletAddress)).to.be.true

        const nonce = await token.nonces(wallet.address)
        const expiry = MaxUint256
        const digest = await getApprovalDigest(
            token,
            { holder: wallet.address, spender: txMaker, allowed: 0 },
            nonce,
            expiry
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), wallet.privKey)
        await token.permit(wallet.address, txMaker, expiry, false, v, hexlify(r), hexlify(s), { from: walletAddress })

        expect(await token.allowance(walletAddress, txMaker)).to.be.bignumber.equal(Zero)
        expect(await token.isOperatorFor(txMaker, walletAddress)).to.be.false
    })
})
