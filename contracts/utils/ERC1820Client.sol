// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.11;

abstract contract IERC1820Registry {
    function setInterfaceImplementer(address _addr, bytes32 _interfaceHash, address _implementer) external virtual;
    function getInterfaceImplementer(address _addr, bytes32 _interfaceHash) external virtual view returns (address);
    function setManager(address _addr, address _newManager) external virtual;
    function getManager(address _addr) public virtual view returns (address);
}

/**
 * Base client to interact with the ERC1820 registry.
 */
contract ERC1820Client {
    IERC1820Registry constant internal _ERC1820_REGISTRY = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    function setInterfaceImplementation(string memory _interfaceLabel, address _implementation) internal {
        bytes32 interfaceHash = keccak256(abi.encodePacked(_interfaceLabel));
        _ERC1820_REGISTRY.setInterfaceImplementer(address(this), interfaceHash, _implementation);
    }

    function interfaceAddr(address addr, string memory _interfaceLabel) internal view returns(address) {
        bytes32 interfaceHash = keccak256(abi.encodePacked(_interfaceLabel));
        return _ERC1820_REGISTRY.getInterfaceImplementer(addr, interfaceHash);
    }

    function delegateManagement(address _newManager) internal {
        _ERC1820_REGISTRY.setManager(address(this), _newManager);
    }
}
