// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.11;

import "./interfaces/IERC20.sol";
import "./interfaces/IERC777.sol";
import "./interfaces/IERC777Recipient.sol";
import "./interfaces/IERC777Sender.sol";
import "./interfaces/IUpgradeAgent.sol";
import "./utils/SafeMath.sol";
import "./utils/Address.sol";
import "./utils/Context.sol";
import "./utils/ERC1820Client.sol";


contract MystToken is Context, IERC777, IERC20, IUpgradeAgent, IERC777Recipient, ERC1820Client {
    using SafeMath for uint256;
    using Address for address;

    address private _originalToken;                          // Address of MYSTv1 token
    uint256 private _originalSupply;                         // Token supply of MYSTv1 token

    address private _upgradeMaster;                          // He can enable future token migration
    IUpgradeAgent private _upgradeAgent;                     // The next contract where the tokens will be migrated
    uint256 private _totalUpgraded;                          // How many tokens we have upgraded by now

    mapping(address => uint256) private _balances;
    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    // keccak256("ERC777TokensSender")
    bytes32 constant private _TOKENS_SENDER_INTERFACE_HASH =
        0x29ddb589b1fb5fc7cf394961c1adf5f8c6454761adf795e67fe149f658abe895;

    // keccak256("ERC777TokensRecipient")
    bytes32 constant private _TOKENS_RECIPIENT_INTERFACE_HASH =
        0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b;

    // EIP712
    bytes32 public DOMAIN_SEPARATOR;

    // keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)");
    bytes32 public constant PERMIT_TYPEHASH = 0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb;

    // The nonces mapping is given for replay protection in permit function.
    mapping(address => uint) public nonces;

    // This isn't ever read from - it's only used to respond to the defaultOperators query.
    address[] private _defaultOperatorsArray;

    // Always empty as we're not using default operators.
    mapping(address => bool) private _defaultOperators;

    // For each account, a mapping of its operators.
    mapping(address => mapping(address => bool)) private _operators;

    // ERC20-allowances
    mapping (address => mapping (address => uint256)) private _allowances;

    // State of token upgrade
    enum UpgradeState {Unknown, NotAllowed, WaitingForAgent, ReadyToUpgrade, Upgrading, Completed}

    // Token upgrade events
    event Upgrade(address indexed from, address indexed to, address agent, uint256 _value);
    event UpgradeAgentSet(address agent);
    event UpgradeMasterSet(address master);

    constructor(address originalToken) public {
        _name = "Mysterium";
        _symbol = "MYST";

        // register interfaces
        setInterfaceImplementation("ERC777Token", address(this));
        setInterfaceImplementation("ERC777Token", address(this));
        setInterfaceImplementation("ERC777TokensRecipient", address(this));

        // upgradability settings
        _originalToken  = originalToken;
        _originalSupply = IERC20(_originalToken).totalSupply();

        // set upgrade master
        _upgradeMaster = _msgSender();

        // construct EIP712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
                keccak256(bytes(_name)),
                keccak256(bytes('1')),
                _chainID(),
                address(this)
            )
        );
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function granularity() public view override returns (uint256) {
        return 1;
    }

    function totalSupply() public view override(IERC20, IERC777) returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address tokenHolder) public view override(IERC20, IERC777) returns (uint256) {
        return _balances[tokenHolder];
    }

    /**
     * @dev See {IERC777-send}.
     *
     * Also emits a {IERC20-Transfer} event for ERC20 compatibility.
     */
    function send(address recipient, uint256 amount, bytes memory data) public override  {
        _send(_msgSender(), recipient, amount, data, "", true);
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Unlike `send`, `recipient` is _not_ required to implement the {IERC777Recipient}
     * interface if it is a contract.
     *
     * Also emits a {Sent} event.
     */
    function transfer(address recipient, uint256 amount) public override returns (bool) {
        _send(_msgSender(), recipient, amount, "", "", false);
        return true;
    }

    function burn(uint256 amount, bytes memory data) public override  {
        _burn(_msgSender(), amount, data, "");
    }

    function isOperatorFor(address operator, address tokenHolder) public view override returns (bool) {
        return operator == tokenHolder || _operators[tokenHolder][operator];
    }

    function authorizeOperator(address operator) public override  {
        require(operator != address(0x0), "ERC777: authorizing zero address as operator");
        _authorizeOperator(_msgSender(), operator);
    }

    function revokeOperator(address operator) public override  {
        require(operator != _msgSender(), "ERC777: revoking self as operator");
        _revokeOperator(_msgSender(), operator);
    }

    function defaultOperators() public view override returns (address[] memory) {
        return _defaultOperatorsArray;
    }

    /**
     * Emits {Sent} and {IERC20-Transfer} events.
     */
    function operatorSend(address sender, address recipient, uint256 amount, bytes memory data, bytes memory operatorData) public override {
        require(isOperatorFor(_msgSender(), sender), "ERC777: caller is not an operator for holder");
        _send(sender, recipient, amount, data, operatorData, true);
    }

    /**
     * Emits {Burned} and {IERC20-Transfer} events.
     */
    function operatorBurn(address account, uint256 amount, bytes memory data, bytes memory operatorData) public override {
        require(isOperatorFor(_msgSender(), account), "ERC777: caller is not an operator for holder");
        _burn(account, amount, data, operatorData);
    }

    /**
     * Note that operator and allowance concepts are orthogonal: operators may
     * not have allowance, and accounts with allowance may not be operators
     * themselves.
     */
    function allowance(address holder, address spender) public view override returns (uint256) {
        return _allowances[holder][spender];
    }

    /**
     * Note that accounts cannot have allowance issued by their operators.
     */
    function approve(address spender, uint256 value) public override returns (bool) {
        address holder = _msgSender();
        _approve(holder, spender, value);
        return true;
    }

    /**
     * Approve by signature
     *
     * Note that we're using permit not only for to set allowance (as ERC2612 is describing),
     * but also to set opetator. So instead of uint value we're using bool allowed (same as
     * dai does) and are setting approval to uint(-1).s
     */
    function permit(address holder, address spender, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s) external {
        require(expiry >= block.timestamp, 'Permit expired');
        bytes32 digest = keccak256(
            abi.encodePacked(
                '\x19\x01',
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, holder, spender, nonces[holder]++, expiry, allowed))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == holder, 'ERC777: invalid signature');

        if (allowed) {
            _approve(holder, spender, uint(-1));
            _authorizeOperator(holder, spender);
        } else {
            _approve(holder, spender, 0);
            _revokeOperator(holder, spender);
        }
    }

    /**
    * Note that operator and allowance concepts are orthogonal: operators cannot
    * call `transferFrom` (unless they have allowance), and accounts with
    * allowance cannot call `operatorSend` (unless they are operators).
    *
    * Emits {Sent}, {IERC20-Transfer} and {IERC20-Approval} events.
    */
    function transferFrom(address holder, address recipient, uint256 amount) public override returns (bool) {
        require(recipient != address(0), "ERC777: transfer to the zero address");
        require(holder != address(0), "ERC777: transfer from the zero address");

        address spender = _msgSender();

        _callTokensToSend(spender, holder, recipient, amount, "", "");

        // Allowance for uint256(-1) means "always allowed" and is analog for operators but in erc20 semantics.
        if (holder != spender && _allowances[holder][spender] != uint256(-1)) {
            _approve(holder, spender, _allowances[holder][spender].sub(amount, "ERC777: transfer amount exceeds allowance"));
        }

        _move(spender, holder, recipient, amount, "", "");
        _callTokensReceived(spender, holder, recipient, amount, "", "", false);

        return true;
    }

    /**
     * Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * If a send hook is registered for `account`, the corresponding function
     * will be called with `operator`, `data` and `operatorData`.
     *
     * See {IERC777Sender} and {IERC777Recipient}.
     *
     * Emits {Minted} and {IERC20-Transfer} events.
     *
     * Requirements:
     * - `account` cannot be the zero address.
     * - if `account` is a contract, it must implement the {IERC777Recipient}
     * interface.
     */
    function _mint(address account, uint256 amount, bytes memory userData, bytes memory operatorData) internal virtual {
        require(account != address(0), "ERC777: mint to the zero address");

        address operator = _msgSender();

        // Update state variables
        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);

        _callTokensReceived(operator, address(0), account, amount, userData, operatorData, false);

        emit Minted(operator, account, amount, userData, operatorData);
        emit Transfer(address(0), account, amount);
    }

    function _send(address from, address to, uint256 amount, bytes memory userData, bytes memory operatorData, bool requireReceptionAck) internal {
        require(from != address(0), "ERC777: send from the zero address");
        require(to != address(0), "ERC777: send to the zero address");

        address operator = _msgSender();

        _callTokensToSend(operator, from, to, amount, userData, operatorData);
        _move(operator, from, to, amount, userData, operatorData);
        _callTokensReceived(operator, from, to, amount, userData, operatorData, requireReceptionAck);
    }

    function _burn(address from, uint256 amount, bytes memory data, bytes memory operatorData) internal {
        require(from != address(0), "ERC777: burn from the zero address");

        address operator = _msgSender();

        _callTokensToSend(operator, from, address(0), amount, data, operatorData);

        // Update state variables
        _balances[from] = _balances[from].sub(amount, "ERC777: burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(amount);

        emit Burned(operator, from, amount, data, operatorData);
        emit Transfer(from, address(0), amount);
    }

    function _move(address operator, address from, address to, uint256 amount, bytes memory userData, bytes memory operatorData) private {
        _balances[from] = _balances[from].sub(amount, "ERC777: transfer amount exceeds balance");
        _balances[to] = _balances[to].add(amount);

        emit Sent(operator, from, to, amount, userData, operatorData);
        emit Transfer(from, to, amount);
    }

    /**
     * Note that accounts cannot have allowance issued by their operators.
     */
    function _approve(address holder, address spender, uint256 value) internal {
        require(holder != address(0), "ERC777: approve from the zero address");
        require(spender != address(0), "ERC777: approve to the zero address");

        _allowances[holder][spender] = value;
        emit Approval(holder, spender, value);
    }

    function _authorizeOperator(address holder, address operator) private {
        require(holder != operator, "ERC777: authorizing self as operator");
        _operators[holder][operator] = true;
        emit AuthorizedOperator(operator, holder);
    }

    function _revokeOperator(address holder, address operator) private {
        delete _operators[holder][operator];
        emit RevokedOperator(operator, holder);
    }

    /**
     * Call from.tokensToSend() if the interface is registered
     */
    function _callTokensToSend(address operator, address from, address to, uint256 amount, bytes memory userData, bytes memory operatorData) private {
        address implementer = _ERC1820_REGISTRY.getInterfaceImplementer(from, _TOKENS_SENDER_INTERFACE_HASH);
        if (implementer != address(0)) {
            IERC777Sender(implementer).tokensToSend(operator, from, to, amount, userData, operatorData);
        }
    }

    /**
     * Call to.tokensReceived() if the interface is registered. Reverts if the recipient is a contract but
     * tokensReceived() was not registered for the recipient. If `requireReceptionAck` is true, contract
     * recipients are required to implement ERC777TokensRecipient
     */
    function _callTokensReceived(address operator, address from, address to, uint256 amount, bytes memory userData, bytes memory operatorData, bool requireReceptionAck) private {
        address implementer = _ERC1820_REGISTRY.getInterfaceImplementer(to, _TOKENS_RECIPIENT_INTERFACE_HASH);
        if (implementer != address(0)) {
            IERC777Recipient(implementer).tokensReceived(operator, from, to, amount, userData, operatorData);
        } else if (requireReceptionAck) {
            require(!to.isContract(), "ERC777: token recipient contract has no implementer for ERC777TokensRecipient");
        }
    }


    // -------------- UPGRADE FROM v1 TOKEN --------------

    function originalToken() public view override returns (address) {
        return _originalToken;
    }

    function originalSupply() public view override returns (uint256) {
        return _originalSupply;
    }

    /** Interface marker */
    function isUpgradeAgent() public override pure returns (bool) {
        return true;
    }

    function upgradeFrom(address _account, uint256 _value) public override {
        require(msg.sender == originalToken(), "only original token can call upgradeFrom");

        // Value is multiplied by 0e10 as old token had decimals = 8?
        _mint(_account, _value.mul(10000000000), "", "");

        require(totalSupply() <= originalSupply().mul(10000000000), "can not mint more tokens than in original contract");
    }


    // -------------- PREPARE FOR FUTURE UPGRADABILITY --------------

    function upgradeMaster() public view returns (address) {
        return _upgradeMaster;
    }

    function upgradeAgent() public view returns (address) {
        return address(_upgradeAgent);
    }

    function totalUpgraded() public view returns (uint256) {
        return _totalUpgraded;
    }

    /**
     * Tokens can be upgraded by simply sending them into token smart contract.
     */
    function tokensReceived(address, address _from, address _to, uint256 _amount, bytes calldata _userData, bytes calldata) public override {
        UpgradeState state = getUpgradeState();
        require(state == UpgradeState.ReadyToUpgrade || state == UpgradeState.Upgrading, "token is not in upgrading state");

        require(_to == address(this), "only works with tokens sent to this contract");
        require(msg.sender == address(this), "only working with own tokens");

        _upgrade(_to, _from, _amount, _userData);
    }

    /**
     * Tokens can be upgraded by calling this function.
     */
    function upgrade(uint256 _amount, bytes memory _data) public {
        UpgradeState state = getUpgradeState();
        require(state == UpgradeState.ReadyToUpgrade || state == UpgradeState.Upgrading, "token is not in upgrading state");

        _upgrade(msg.sender, msg.sender, _amount, _data);
    }

    function setUpgradeMaster(address newUpgradeMaster) external {
        require(newUpgradeMaster != address(0x0), "upgrade master can't be zero address");
        require(msg.sender == _upgradeMaster, "only upgrade master can set new one");
        _upgradeMaster = newUpgradeMaster;

        emit UpgradeMasterSet(upgradeMaster());
    }

    function setUpgradeAgent(address agent) external {
        require(msg.sender == _upgradeMaster, "only a master can designate the next agent");
        require(agent != address(0x0));
        require(getUpgradeState() != UpgradeState.Upgrading, "upgrade has already begun");

        _upgradeAgent = IUpgradeAgent(agent);
        require(_upgradeAgent.isUpgradeAgent(), "agent should implement IUpgradeAgent interface");

        // Make sure that token supplies match in source and target
        require(_upgradeAgent.originalSupply() == totalSupply(), "upgrade agent should know token's total supply");

        emit UpgradeAgentSet(upgradeAgent());
    }

    function getUpgradeState() public view returns(UpgradeState) {
        if(address(_upgradeAgent) == address(0x00)) return UpgradeState.WaitingForAgent;
        else if(_totalUpgraded == 0) return UpgradeState.ReadyToUpgrade;
        else if(totalSupply() == 0) return UpgradeState.Completed;
        else return UpgradeState.Upgrading;
    }

    function _upgrade(address from, address to, uint256 amount, bytes memory userData) private {
        require(amount > 0, "upgradable amount should be more than 0");

        // Burn tokens to be upgraded
        _burn(from, amount, userData, "");

        // Remember how many tokens we have upgraded
        _totalUpgraded = _totalUpgraded.add(amount);

        // Upgrade agent upgrades/reissues tokens
        _upgradeAgent.upgradeFrom(to, amount);

        emit Upgrade(from, to, upgradeAgent(), amount);
    }

    function _chainID() private pure returns (uint256) {
        uint256 chainID;
        assembly {
            chainID := chainid()
        }
        return chainID;
    }


    function getChainID() public pure returns (uint256) {
        return _chainID();
    }
}
