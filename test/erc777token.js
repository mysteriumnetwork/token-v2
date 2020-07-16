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


contract('Test ERC777 functionality', ([owner, operator, addressOne, addressTwo, addressThree, ...otherAccounts]) => {
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

    it('has granularity 1', async function () {
        expect(await token.granularity()).to.be.bignumber.equal('1');
    });

    it('should have 0 total supply', async () => {
        expect(await token.totalSupply()).to.be.bignumber.equal(Zero)
    })

    it('should have no default operators', async () => {
        // expect(await token.defaultOperators()).to.be.equal([])
        const defaultOperators = await token.defaultOperators()
        expect(Array.isArray(defaultOperators)).to.be.true
        expect(defaultOperators.length).to.be.equal(0)
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

    it('should successfully send tokens', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const amount = new BN('1000')

        await token.send(addressThree, amount, Buffer.from(''), { from: addressOne })

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(amount)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('should reject sending more tokens than holder has', async () => {
        const amount = OneEther
        await token.send(addressThree, amount, Buffer.from(''), { from: addressOne }).should.be.rejected
    })

    it('should reject sending tokens to non ERC777 receiver smart contract', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const receiver = (await RandomContract.new()).address
        const amount = new BN('1000')

        await token.send(receiver, amount, Buffer.from(''), { from: addressOne }).should.be.rejected

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance)
        expect(await token.balanceOf(receiver)).to.be.bignumber.equal(Zero)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('should successfully send into and touch tokens received of ERC777 receiver smart contract', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const receiver = await RandomERC777ReceiverContract.new()
        const amount = new BN('1000')

        await token.send(receiver.address, amount, Buffer.from(''), { from: addressOne })

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(receiver.address)).to.be.bignumber.equal(amount)
        expect(await receiver.receivedAmount()).to.be.bignumber.equal(amount)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('should burn tokens', async () => {
        const ownerBalance = await token.balanceOf(owner)
        await token.burn(ownerBalance, Buffer.from(''), { from: owner })

        expect(await token.balanceOf(owner)).to.be.bignumber.equal(Zero)
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply.sub(ownerBalance))

        // Rember new token supply
        tokenSupply = tokenSupply.sub(ownerBalance)
    })

    it('should properly authorize operator', async () => {
        expect(await token.isOperatorFor(operator, addressOne)).to.be.false
        await token.authorizeOperator(operator, { from: addressOne })
        expect(await token.isOperatorFor(operator, addressOne)).to.be.true
    })

    it('should not allow sending tokens for not operator', async () => {
        const amount = new BN('888')
        await token.operatorSend(
            addressOne,
            addressThree,
            amount,
            Buffer.from(''),
            Buffer.from(''),
            { from: addressTwo }).should.be.rejected
    })

    it('should allow operator to send tokens', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        const initialAddressThreeBalance = await token.balanceOf(addressThree)
        const amount = new BN('888')

        await token.operatorSend(addressOne, addressThree, amount, Buffer.from(''), Buffer.from(''), { from: operator })

        expect(await token.balanceOf(addressOne)).to.be.bignumber.equal(initialAddressOneBalance.sub(amount))
        expect(await token.balanceOf(addressThree)).to.be.bignumber.equal(initialAddressThreeBalance.add(amount))
        expect(await token.totalSupply()).to.be.bignumber.equal(tokenSupply)
    })

    it('operator can not send more that holder owns', async () => {
        const addressOneBalance = await token.balanceOf(addressOne)
        const amount = OneEther

        expect(addressOneBalance).to.be.bignumber.lessThan(amount)

        await token.operatorSend(
            addressOne,
            addressThree,
            amount,
            Buffer.from(''),
            Buffer.from(''),
            { from: operator }).should.be.rejected
    })

    it('should not allow operator to erc20 transferFrom tokens', async () => {
        const addressOneBalance = await token.balanceOf(addressOne)
        const amount = new BN('888')

        expect(addressOneBalance).to.be.bignumber.greaterThan(amount)
        await token.transferFrom(addressOne, addressThree, amount, { from: operator }).should.be.rejected
    })

    it('should not allow sending tokens for revoked operator', async () => {
        expect(await token.isOperatorFor(operator, addressOne)).to.be.true
        await token.revokeOperator(operator, { from: addressOne })
        expect(await token.isOperatorFor(operator, addressOne)).to.be.false

        const amount = new BN('1')
        expect(amount).to.be.bignumber.lessThan(await token.balanceOf(addressOne))
        await token.operatorSend(
            addressOne,
            addressThree,
            amount,
            Buffer.from(''),
            Buffer.from(''),
            { from: operator }).should.be.rejected
    })

})
