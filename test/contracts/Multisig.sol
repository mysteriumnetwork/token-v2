// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.7.0;

// This is not really multisig, but minimal implementation of what multisigs usualy does
contract Multisig {
    function executeTransaction(address destination, uint value, bytes calldata data) public {
        (bool success, ) = destination.call{value: value}(data);
        require(success, "Tx was rejected by destination");
    }
}