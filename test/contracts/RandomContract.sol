// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RandomContract {
    function move(address token, address to, uint256 amount) public {
        IERC20(token).transfer(to, amount);
    }
}
