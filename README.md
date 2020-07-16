# MYST v2 smart contracts

In this repository you we're storing smart contracts of ERC777 based MYST token (native token of [Mysterium Network](https://mysterium.network]) and set of tools for migration from original token version.

Original MYST token is deployed into Ethereum blockchain at address [0xa645264C5603E96c3b0B078cdab68733794B0A71](https://etherscan.io/token/0xa645264C5603E96c3b0B078cdab68733794B0A71).

## Testing

We're using truffle for smart contract compilation and running tests.

1. Install dependencies

```bash
npm install
```

2. Run local ethereum node, e.g. `ganache`. Make sure to use version greater than 6.9.1.

```bash
npx ganache-cli
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
* While migrating from original ERC20 MYST, it should ensure that token supply will be not changes. It is using 18 decimals hovewer, so migrated tokens have to be multiplied by `e10`.
