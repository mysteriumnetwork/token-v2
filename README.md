# MYST v2 smart contracts

This is repository of ERC777 based MYST token (native token of [Mysterium Network](https://mysterium.network) and set of tools for migration from original token version.

Original MYST token is deployed into Ethereum blockchain at address [0xa645264C5603E96c3b0B078cdab68733794B0A71](https://etherscan.io/token/0xa645264C5603E96c3b0B078cdab68733794B0A71).

## Testing

We're using truffle for smart contract compilation and running tests.

1. Install dependencies

```bash
npm install
```

2. Run local ethereum node, e.g. `ganache`. Make sure to use version greater than 6.9.1.

```bash
npx ganache-cli --mnemonic "amused glory pen avocado toilet dragon entry kitchen cliff retreat canyon danger"
```

3. Run tests (in a separate from ganache terminal)

```bash
npm test
```

## Token functionality

* Implemented ERC777 token standart functionality.
* Support ERC20 imterfaces. Also should call ERC777 `tokensReceived` on ERC20 `transfer` but should not fail if smart contract don't implement it.
* Possibility to enable future token migration by setting upgrade agent.
* Future token migration should be possible by simply sending tokens into token address.
* While migrating from original ERC20 MYST, it should ensure that token supply will be not changes. Original token user 8 and this one is using 18 decimals, so migrated tokens have to be multiplied by `e10`.
* Token has additional `permit` function which aim is to allow setting operator (and giving approval) via signature. We're using permit not only for to set allowance (as ERC2612 is describing but also to set opetator. So instead of uint value we're using bool allowed (same as dai does) and are setting approval to uint(-1).