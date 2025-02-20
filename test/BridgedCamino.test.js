const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("BridgedCaminoV1", function () {
    async function deployBridgedCaminoV1Fixture() {
        // Contracts are deployed using the first signer/account by default
        const [
            deployer,
            defaultAdmin,
            pauserAdmin,
            pauser,
            upgraderAdmin,
            upgrader,
            minterAdmin,
            minter,
            blacklisterAdmin,
            blacklister,
        ] = await ethers.getSigners();

        // Deploy the BridgedCaminoV1 contract implementation
        const BridgedCaminoV1 = await ethers.getContractFactory("BridgedCaminoV1");

        const bridgedCaminoV1Impl = await BridgedCaminoV1.deploy();

        // Encode the initialization data
        const initializeData = bridgedCaminoV1Impl.interface.encodeFunctionData("initialize", [
            defaultAdmin.address,
            pauser.address,
            upgrader.address,
        ]);

        // Get the ERC1967ProxyFactory
        const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");

        // Deploy the proxy contract
        const bridgedCaminoV1Proxy = await ERC1967ProxyFactory.deploy(
            await bridgedCaminoV1Impl.getAddress(),
            initializeData,
        );

        // Get the proxy with the BridgedCaminoV1 interface
        const proxiedBridgedCaminoV1 = await BridgedCaminoV1.attach(await bridgedCaminoV1Proxy.getAddress());

        return {
            proxiedBridgedCaminoV1,
            deployer,
            defaultAdmin,
            pauserAdmin,
            pauser,
            upgraderAdmin,
            upgrader,
            minterAdmin,
            minter,
            blacklisterAdmin,
            blacklister,
        };
    }

    async function bridgedCaminoV1WithMintersFixture() {
        const {
            proxiedBridgedCaminoV1,
            deployer,
            defaultAdmin,
            pauserAdmin,
            pauser,
            upgraderAdmin,
            upgrader,
            minterAdmin,
            minter,
            blacklisterAdmin,
            blacklister,
        } = await loadFixture(deployBridgedCaminoV1Fixture);

        const minterAllowedAmount = ethers.parseEther("1000");
        const MINTER_ROLE_ADMIN = await proxiedBridgedCaminoV1.MINTER_ROLE_ADMIN();

        await proxiedBridgedCaminoV1.connect(defaultAdmin).grantRole(MINTER_ROLE_ADMIN, minterAdmin.address);
        await proxiedBridgedCaminoV1.connect(minterAdmin).configureMinter(minter.address, minterAllowedAmount);

        return {
            proxiedBridgedCaminoV1,
            deployer,
            defaultAdmin,
            pauserAdmin,
            pauser,
            upgraderAdmin,
            upgrader,
            minterAdmin,
            minter,
            blacklisterAdmin,
            blacklister,
            minterAllowedAmount,
        };
    }

    // Helper to get the current chainId.
    async function getChainId() {
        return (await ethers.provider.getNetwork()).chainId;
    }

    // Returns the permit digest as defined in EIP-2612.
    async function signPermit(token, signer, owner, spender, value, nonce, deadline) {
        const name = await token.name();
        const version = "1";
        const chainId = await getChainId();
        const verifyingContract = await token.getAddress();

        const domain = {
            name,
            version,
            chainId,
            verifyingContract,
        };

        // The permit struct following EIP-2612.
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };

        const message = {
            owner: owner.address,
            spender: spender.address,
            value: value.toString(),
            nonce: nonce.toString(),
            deadline: deadline.toString(),
        };

        const signature = await signer.signTypedData(domain, types, message);

        return signature;
    }

    describe("Deployment", function () {
        it("Should set the right name and symbol", async function () {
            const { proxiedBridgedCaminoV1 } = await loadFixture(deployBridgedCaminoV1Fixture);
            expect(await proxiedBridgedCaminoV1.name()).to.equal("BridgedCamino");
            expect(await proxiedBridgedCaminoV1.symbol()).to.equal("WCAM");
        });

        it("Should set the right decimals", async function () {
            const { proxiedBridgedCaminoV1 } = await loadFixture(deployBridgedCaminoV1Fixture);
            expect(await proxiedBridgedCaminoV1.decimals()).to.equal(18);
        });

        it("Should set the right total supply", async function () {
            const { proxiedBridgedCaminoV1 } = await loadFixture(deployBridgedCaminoV1Fixture);
            expect(await proxiedBridgedCaminoV1.totalSupply()).to.equal(0);

            // TODO: check total supply after mint
        });

        it("Should set the right roles", async function () {
            const { proxiedBridgedCaminoV1, deployer, defaultAdmin, pauserAdmin, pauser, upgraderAdmin, upgrader } =
                await loadFixture(deployBridgedCaminoV1Fixture);

            // Get roles
            const MINTER_ROLE = await proxiedBridgedCaminoV1.MINTER_ROLE();
            const MINTER_ROLE_ADMIN = await proxiedBridgedCaminoV1.MINTER_ROLE_ADMIN();
            const PAUSER_ROLE = await proxiedBridgedCaminoV1.PAUSER_ROLE();
            const PAUSER_ROLE_ADMIN = await proxiedBridgedCaminoV1.PAUSER_ROLE_ADMIN();
            const UPGRADER_ROLE = await proxiedBridgedCaminoV1.UPGRADER_ROLE();
            const UPGRADER_ROLE_ADMIN = await proxiedBridgedCaminoV1.UPGRADER_ROLE_ADMIN();

            expect(await proxiedBridgedCaminoV1.getRoleAdmin(MINTER_ROLE)).to.equal(MINTER_ROLE_ADMIN);

            expect(await proxiedBridgedCaminoV1.hasRole(PAUSER_ROLE, pauser.address)).to.equal(true);
            expect(await proxiedBridgedCaminoV1.getRoleAdmin(PAUSER_ROLE)).to.equal(PAUSER_ROLE_ADMIN);

            expect(await proxiedBridgedCaminoV1.hasRole(UPGRADER_ROLE, upgrader.address)).to.equal(true);
            expect(await proxiedBridgedCaminoV1.getRoleAdmin(UPGRADER_ROLE)).to.equal(UPGRADER_ROLE_ADMIN);
        });
    });

    describe("Mint", function () {
        it("Should mint tokens", async function () {
            const {
                proxiedBridgedCaminoV1,
                deployer,
                defaultAdmin,
                pauserAdmin,
                pauser,
                upgraderAdmin,
                upgrader,
                minterAdmin,
                minter,
            } = await loadFixture(deployBridgedCaminoV1Fixture);

            // Get roles
            const MINTER_ROLE = await proxiedBridgedCaminoV1.MINTER_ROLE();
            const MINTER_ROLE_ADMIN = await proxiedBridgedCaminoV1.MINTER_ROLE_ADMIN();

            // Grant the minter admin role
            expect(await proxiedBridgedCaminoV1.connect(defaultAdmin).grantRole(MINTER_ROLE_ADMIN, minterAdmin.address))
                .to.emit(proxiedBridgedCaminoV1, "RoleGranted")
                .withArgs(MINTER_ROLE_ADMIN, minterAdmin.address, defaultAdmin.address);

            // Configure minter role using the minter admin
            const minterAllowedAmount = ethers.parseEther("1000");
            const newMinter = true;

            const configureMinterTx = await proxiedBridgedCaminoV1
                .connect(minterAdmin)
                .configureMinter(minter.address, minterAllowedAmount);

            // Check MinterConfigured event
            await expect(configureMinterTx)
                .to.emit(proxiedBridgedCaminoV1, "MinterConfigured")
                .withArgs(minter.address, minterAllowedAmount, newMinter);

            // Check RoleGranted event
            await expect(configureMinterTx)
                .to.emit(proxiedBridgedCaminoV1, "RoleGranted")
                .withArgs(MINTER_ROLE, minter.address, minterAdmin.address);

            // Check minter role
            expect(await proxiedBridgedCaminoV1.hasRole(MINTER_ROLE, minter.address)).to.equal(true);

            // Check minter allowance
            expect(await proxiedBridgedCaminoV1.minterAllowance(minter.address)).to.equal(minterAllowedAmount);

            // Check mint
            const mintTx = await proxiedBridgedCaminoV1.connect(minter).mint(minter.address, minterAllowedAmount);

            // Check Mint event
            await expect(mintTx)
                .to.emit(proxiedBridgedCaminoV1, "Mint")
                .withArgs(minter.address, minter.address, minterAllowedAmount);

            // Check Transfer event
            await expect(mintTx)
                .to.emit(proxiedBridgedCaminoV1, "Transfer")
                .withArgs(ethers.ZeroAddress, minter.address, minterAllowedAmount);

            // Check token balance change
            await expect(mintTx).to.changeTokenBalance(proxiedBridgedCaminoV1, minter.address, minterAllowedAmount);

            // Check minter allowance
            expect(await proxiedBridgedCaminoV1.minterAllowance(minter.address)).to.equal(0n);
        });

        it("Should revert if not minter", async function () {
            const {
                proxiedBridgedCaminoV1,
                deployer,
                defaultAdmin,
                pauserAdmin,
                pauser,
                upgraderAdmin,
                upgrader,
                minterAdmin,
                minter,
            } = await loadFixture(deployBridgedCaminoV1Fixture);

            // Get minter role
            const MINTER_ROLE = await proxiedBridgedCaminoV1.MINTER_ROLE();

            // Try to mint
            await expect(
                proxiedBridgedCaminoV1.connect(deployer).mint(deployer.address, 1),
            ).to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount");

            await expect(proxiedBridgedCaminoV1.connect(pauser).mint(pauser.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(pauser.address, MINTER_ROLE);

            await expect(proxiedBridgedCaminoV1.connect(upgrader).mint(upgrader.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(upgrader.address, MINTER_ROLE);

            await expect(proxiedBridgedCaminoV1.connect(defaultAdmin).mint(defaultAdmin.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(defaultAdmin.address, MINTER_ROLE);

            // Grant minter admin
            const MINTER_ROLE_ADMIN = await proxiedBridgedCaminoV1.MINTER_ROLE_ADMIN();
            await proxiedBridgedCaminoV1.connect(defaultAdmin).grantRole(MINTER_ROLE_ADMIN, minterAdmin.address);

            // Try to mint
            await expect(proxiedBridgedCaminoV1.connect(minterAdmin).mint(minterAdmin.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(minterAdmin.address, MINTER_ROLE);
        });

        it("Should revert configure minter if not minter admin", async function () {
            const { proxiedBridgedCaminoV1, deployer, defaultAdmin, pauser, upgrader, minter } =
                await loadFixture(deployBridgedCaminoV1Fixture);

            const MINTER_ROLE_ADMIN = await proxiedBridgedCaminoV1.MINTER_ROLE_ADMIN();

            // Try to configure minter
            await expect(
                proxiedBridgedCaminoV1.connect(deployer).configureMinter(minter.address, 1),
            ).to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount");

            await expect(proxiedBridgedCaminoV1.connect(pauser).configureMinter(minter.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(pauser.address, MINTER_ROLE_ADMIN);

            await expect(proxiedBridgedCaminoV1.connect(upgrader).configureMinter(minter.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(upgrader.address, MINTER_ROLE_ADMIN);

            await expect(proxiedBridgedCaminoV1.connect(defaultAdmin).configureMinter(minter.address, 1))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AccessControlUnauthorizedAccount")
                .withArgs(defaultAdmin.address, MINTER_ROLE_ADMIN);
        });

        it("Should revert if amount exceeds minter allowance", async function () {
            const { proxiedBridgedCaminoV1, minterAdmin, minter, minterAllowedAmount } = await loadFixture(
                bridgedCaminoV1WithMintersFixture,
            );

            const invalidAmount = minterAllowedAmount + 1n;

            // Try to mint more than minter allowance
            await expect(proxiedBridgedCaminoV1.connect(minter).mint(minter.address, invalidAmount))
                .to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "AmountExceedsMintAllowance")
                .withArgs(minter.address, invalidAmount);
        });

        it("Should revert when paused", async function () {
            const { proxiedBridgedCaminoV1, pauser, minterAdmin, minter, minterAllowedAmount } = await loadFixture(
                bridgedCaminoV1WithMintersFixture,
            );

            // Pause the contract
            expect(await proxiedBridgedCaminoV1.connect(pauser).pause()).to.emit(proxiedBridgedCaminoV1, "Paused");

            // Try to mint
            await expect(
                proxiedBridgedCaminoV1.connect(minter).mint(minter.address, minterAllowedAmount),
            ).to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "EnforcedPause");

            // Try to configure minter
            await expect(
                proxiedBridgedCaminoV1.connect(minterAdmin).configureMinter(minter.address, minterAllowedAmount),
            ).to.be.revertedWithCustomError(proxiedBridgedCaminoV1, "EnforcedPause");
        });
    });
});
