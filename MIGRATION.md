MYSTv1 to MYSTv2 migration guide
--------------------------------

Migration in essence is calling current token smart contract with a function `upgrade(uint256 value)`.

Once we’ll enable migration, you can initiate it by doing transactions from your token address which holds MYST tokens (e.g. `0xa12431d0b9db640034b0cdfceef9cce161e62be4`) into our current token smart contract (`0xa645264C5603E96c3b0B078cdab68733794B0A71`) and call `upgrade(uint256 value)` function there.

Example payload data (migrating 20.000 MYST):
```
0x45977d03000000000000000000000000000000000000000000000000000001d1a94a2000
```

NOTE:
- Legacy tokens will be burned and MYSTv2 will be created and sent to the same address.
- You can do migration in parts, or when new tokens arrive.
- Migration process has no time limit, so if anyone in the future would send you legacy MYST, in reality you could migrate them even after a year.
