const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack } = require('ethers').utils
const secp256k1 = require('secp256k1')
const { randomBytes } = require('crypto')
const { privateToPublic, setLengthLeft } = require('ethereumjs-util')

const PERMIT_TYPEHASH = keccak256(
    toUtf8Bytes('Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)')
)

function getDomainSeparator(name, tokenAddress) {
    return keccak256(
        defaultAbiCoder.encode(
            ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
            [
                keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
                keccak256(toUtf8Bytes(name)),
                keccak256(toUtf8Bytes('1')),
                1,
                tokenAddress
            ]
        )
    )
}

async function getApprovalDigest(token, approve, nonce, expiry) {
    const name = await token.name()
    const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
    nonce = setLengthLeft(nonce.toBuffer(), 32).toString('hex')

    return keccak256(
        solidityPack(
            ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
            [
                '0x19',
                '0x01',
                DOMAIN_SEPARATOR,
                keccak256(
                    defaultAbiCoder.encode(
                        ['bytes32', 'address', 'address', 'uint256', 'uint256', 'bool'],
                        [PERMIT_TYPEHASH, approve.holder, approve.spender, nonce, expiry, approve.allowed]
                    )
                )
            ]
        )
    )
}

function toAddress(pubKey) {
    const hash = keccak256(pubKey).slice(-40)
    return `0x${hash.toString('hex')}`
}

function generatePrivateKey() {
    let privKey
    do {
        privKey = randomBytes(32)
    } while (!secp256k1.privateKeyVerify(privKey))

    return privKey
}

function generateWallet(privKey) {
    if (privKey === undefined)
        privKey = generatePrivateKey()

    const pubKey = privateToPublic(privKey)
    const address = toAddress(pubKey)
    return { privKey, pubKey, address }
}

module.exports = {
    PERMIT_TYPEHASH,
    getApprovalDigest,
    getDomainSeparator,
    generateWallet
}
