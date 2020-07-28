# MYST v2 smart contracts

This is repository of MYST v2 token (native token of [Mysterium Network](https://mysterium.network)) and set of tools for migration from original token version.

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

* Implemented ERC20 + ERC2612 (`permit`) token standard functionality.
* Possibility to enable future token migration by setting upgrade agent.
* While migrating from original ERC20 MYST, it should ensure that token supply will be not changes. Original token user 8 and this one is using 18 decimals, so migrated tokens have to be multiplied by `e10`.
* Token has additional `permit` function which is token extension, as popularized by the Dai ERC20. We're implemeneting (to be) ERC2612 standard.
