import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { App } from "./App.js";
import { validateProfileUnlock } from "./unlock.js";
import { ProfileManager } from "../core/profile-manager.js";
import { ProfileMetadata, ProfileRecord } from "../types.js";

type Stage =
  | "loading"
  | "create-name"
  | "create-choice"
  | "create-passphrase"
  | "select-profile"
  | "unlock"
  | "chat";

export interface RootAppProps {
  serverUrl: string;
}

export function RootApp({ serverUrl }: RootAppProps): React.JSX.Element {
  const [manager] = useState(() => new ProfileManager());
  const [stage, setStage] = useState<Stage>("loading");
  const [profiles, setProfiles] = useState<ProfileMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<ProfileRecord>();
  const [passphraseInput, setPassphraseInput] = useState("");
  const [createWithPassphrase, setCreateWithPassphrase] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize(): Promise<void> {
    manager.ensureBaseLayout();
    const discovered = manager.listProfiles();
    if (discovered.length === 0) {
      setProfiles([]);
      setStatus("No profiles found. Enter a profile name and press Enter.");
      setNewProfileName("");
      setStage("create-name");
      return;
    }
    setProfiles(discovered);
    setSelectedIndex(0);
    setStage("select-profile");
    setStatus("Select a profile. Press c to create a new one.");
  }

  async function createProfileAndOpen(): Promise<void> {
    const profileName = newProfileName.trim();
    if (!profileName) {
      setStatus("Profile name cannot be empty");
      return;
    }
    if (profiles.some((profile) => profile.profileName === profileName)) {
      setStatus(`Profile ${profileName} already exists`);
      setStage("create-name");
      return;
    }
    if (createWithPassphrase && !passphraseInput) {
      setStatus("Passphrase cannot be empty");
      return;
    }
    try {
      setStatus("Generating OpenPGP keypair...");
      await manager.createProfile(profileName, createWithPassphrase ? passphraseInput : undefined);
      const discovered = manager.listProfiles();
      setProfiles(discovered);
      setSelectedIndex(Math.max(discovered.findIndex((profile) => profile.profileName === profileName), 0));
      const record = manager.loadProfile(profileName);
      setSelectedProfile(record);
      setStage("chat");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create profile");
      setStage("create-name");
    }
  }

  async function openSelectedProfile(withPassphrase?: string): Promise<void> {
    const metadata = profiles[selectedIndex];
    if (!metadata) {
      return;
    }
    const record = manager.loadProfile(metadata.profileName);
    if (record.privateKeyEncrypted) {
      setStatus(`Unlocking ${record.profileName}...`);
      try {
        await validateProfileUnlock(record, withPassphrase);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to unlock private key");
        setStage("unlock");
        return;
      }
    }
    setSelectedProfile(record);
    setPassphraseInput(withPassphrase ?? "");
    setStage("chat");
  }

  function resetCreateFlowStatus(): void {
    if (profiles.length === 0) {
      setStatus("No profiles found. Enter a profile name and press Enter.");
      setStage("create-name");
      return;
    }
    setStatus("Select a profile. Press c to create a new one.");
    setStage("select-profile");
  }

  useInput((input, key) => {
    if (stage === "create-name") {
      if (key.escape && profiles.length > 0) {
        setNewProfileName("");
        setPassphraseInput("");
        setCreateWithPassphrase(false);
        resetCreateFlowStatus();
        return;
      }
      if (key.return) {
        if (!newProfileName.trim()) {
          setStatus("Profile name cannot be empty");
          return;
        }
        if (profiles.some((profile) => profile.profileName === newProfileName.trim())) {
          setStatus(`Profile ${newProfileName.trim()} already exists`);
          return;
        }
        setPassphraseInput("");
        setCreateWithPassphrase(false);
        setStatus(`Protect private key for ${newProfileName.trim()}?`);
        setStage("create-choice");
        return;
      }
      if (key.backspace || key.delete) {
        setNewProfileName((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setNewProfileName((current) => current + input);
      }
      return;
    }

    if (stage === "create-choice") {
      if (input.toLowerCase() === "y") {
        setCreateWithPassphrase(true);
        setStatus(`Enter a passphrase for ${newProfileName.trim()} and press Enter`);
        setStage("create-passphrase");
        return;
      }
      if (key.escape && profiles.length > 0) {
        setPassphraseInput("");
        setCreateWithPassphrase(false);
        setStage("create-name");
        setStatus("Enter a profile name and press Enter.");
        return;
      }
      if (input.toLowerCase() === "n" || key.return) {
        setCreateWithPassphrase(false);
        void createProfileAndOpen();
      }
      return;
    }

    if (stage === "create-passphrase") {
      if (key.escape && profiles.length > 0) {
        setPassphraseInput("");
        setCreateWithPassphrase(false);
        setStage("create-choice");
        setStatus(`Protect private key for ${newProfileName.trim()}?`);
        return;
      }
      if (key.return) {
        void createProfileAndOpen();
        return;
      }
      if (key.backspace || key.delete) {
        setPassphraseInput((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setPassphraseInput((current) => current + input);
      }
      return;
    }

    if (stage === "select-profile") {
      if (key.downArrow) {
        setSelectedIndex((current) => Math.min(current + 1, Math.max(profiles.length - 1, 0)));
      }
      if (key.upArrow) {
        setSelectedIndex((current) => Math.max(current - 1, 0));
      }
      if (input.toLowerCase() === "c") {
        setNewProfileName("");
        setPassphraseInput("");
        setCreateWithPassphrase(false);
        setStatus("Enter a new profile name and press Enter.");
        setStage("create-name");
        return;
      }
      if (key.return) {
        const profile = profiles[selectedIndex];
        if (!profile) {
          return;
        }
        if (profile.privateKeyEncrypted) {
          setStatus(`Enter passphrase for ${profile.profileName}`);
          setPassphraseInput("");
          setStage("unlock");
          return;
        }
        void openSelectedProfile();
      }
      return;
    }

    if (stage === "unlock") {
      if (key.return) {
        void openSelectedProfile(passphraseInput);
        return;
      }
      if (key.backspace || key.delete) {
        setPassphraseInput((current) => current.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setPassphraseInput((current) => current + input);
      }
    }
  });

  if (stage === "chat" && selectedProfile) {
    return <App profile={selectedProfile} passphrase={passphraseInput || undefined} serverUrl={serverUrl} />;
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>TheKeeper</Text>
      <Text>{status}</Text>
      {stage === "create-name" ? <Text>Profile name: {newProfileName || "_"}</Text> : null}
      {stage === "create-choice" ? (
        <Text>Press y for a passphrase-protected key, or Enter/n for an unprotected key.</Text>
      ) : null}
      {stage === "create-passphrase" ? <Text>Passphrase: {"*".repeat(passphraseInput.length)}</Text> : null}
      {stage === "select-profile" ? (
        <Box flexDirection="column" marginTop={1}>
          {profiles.map((profile, index) => (
            <Text key={profile.profileName} inverse={index === selectedIndex}>
              {profile.profileName} {profile.privateKeyEncrypted ? "(locked)" : ""}
            </Text>
          ))}
          <Text dimColor>Enter to open. Press c to create a new profile.</Text>
        </Box>
      ) : null}
      {stage === "unlock" ? <Text>Passphrase: {"*".repeat(passphraseInput.length)}</Text> : null}
    </Box>
  );
}
