// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.11;

import "./interfaces/IERC20.sol";
import "./utils/SafeMath.sol";

contract MystMigrator {
    using SafeMath for uint256;

    address internal _beneficiary; // address which will receive migrated tokens
    IERC20 public _legacyToken; // legacy MYST token
    IERC20 public _token; // new MYST token

    function getBeneficiary() public view returns (address) {
        return _beneficiary;
    }

    constructor(
        address legacyAddress,
        address newAddress,
        address beneficiary
    ) public {
        _legacyToken = IERC20(legacyAddress);
        _token = IERC20(newAddress);
        _beneficiary = beneficiary;
    }

    fallback() external payable {
        _legacyToken.upgrade(_legacyToken.balanceOf(address(this)));
        _token.transfer(_beneficiary, _token.balanceOf(address(this)));

        // Return any eth sent to this address
        if (msg.value > 0) {
            (bool success, ) = address(msg.sender).call{value: msg.value}("");
            require(
                success,
                "Unable to send ethers back, recipient may have reverted"
            );
        }
    }

    /**
     * Will call upgrade in legacy MYST token contract.
     * This will upgrade given amount of holded by this smart contract legacyMYST into new MYST
     */
    function upgrade(uint256 amount) public {
        _legacyToken.upgrade(amount);
    }

    /**
     * Setting new beneficiary of funds.
     */
    function setBeneficiary(address newBeneficiary) public {
        require(
            msg.sender == _beneficiary,
            "Only a current beneficiary can set new one"
        );
        require(
            newBeneficiary != address(0),
            "Beneficiary can't be zero addreess"
        );

        _beneficiary = newBeneficiary;
    }

    /**
       Transfers selected tokens into `_beneficiary` address.
    */
    function claimTokens(address token) public {
        require(
            _beneficiary != address(0),
            "Beneficiary can't be zero addreess"
        );
        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(_beneficiary, amount);
    }
}
