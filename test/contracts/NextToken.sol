// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import { IUpgradeAgent } from "../../contracts/interfaces/IUpgradeAgent.sol";

contract NextToken is ERC777, IUpgradeAgent {
    address private _originalToken;
    uint256 private _originalSupply;
    address[] private empty;

    constructor (address originalToken) ERC777("Next MYST token", "MYSTTv3", empty) public {
        _originalToken  = originalToken;
        _originalSupply = IERC777(_originalToken).totalSupply();
    }

    function originalSupply() public override view returns (uint256) {
        return _originalSupply;
    }

    function originalToken() public override view returns (address) {
        return _originalToken;
    }

    function isUpgradeAgent() public override pure returns (bool) {
        return true;
    }

    function upgradeFrom(address _account, uint256 _amount) public override {
        require(msg.sender == _originalToken, "only original token can call upgradeFrom");

        // Value is multiplied by 0e10 as old token had decimals = 8?
        _mint(_account, _amount, "", "");

        require(totalSupply() <= _originalSupply, "can not mint more tokens than in original contract");
    }
}
