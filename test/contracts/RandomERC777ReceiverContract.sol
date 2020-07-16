// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "../../contracts/interfaces/IERC777Recipient.sol";
import "../../contracts/utils/ERC1820Client.sol";

contract RandomERC777ReceiverContract is IERC777Recipient, ERC1820Client {
    uint256 public receivedAmount;

    constructor() public {
        setInterfaceImplementation("ERC777TokensRecipient", address(this));
    }

    function tokensReceived(address, address, address, uint256 amount, bytes calldata, bytes calldata) public override {
        receivedAmount = receivedAmount + amount;
    }

    function move(address token, address to, uint256 amount) public {
        IERC777(token).send(to, amount, "");
    }
}
