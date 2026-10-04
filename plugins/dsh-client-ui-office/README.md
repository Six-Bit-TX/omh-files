---
description: "Edit local DOCX, XLSX, and PPTX files in the Omchor file panel with a local ONLYOFFICE server and guarded saves."
kind: "package-reference"
---

# @local/dsh-client-ui-office

English | [中文](README.zh.md)

## Summary

Open and edit local Word documents, Excel workbooks, and PowerPoint presentations inside Omchor. The editor uses a local ONLYOFFICE Docs Community container; document bytes stay on the machine. Saving writes back to the workspace file and refuses to overwrite detected external changes. Docker is required.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open a `.docx`, `.xlsx`, or `.pptx` file from Omchor's file panel, edit it, choose **Save locally** in the panel header, and wait for **Saved to local file** before leaving. The button becomes available after the editor finishes sending pending edits. Pending changes trigger a browser unload warning.

### Setup

Use the local Linux Docker engine, then run these provisioning commands from the checkout:

```sh
node plugins/dsh-client-ui-office/setup.mjs
```

Restart the Omchor Web profile and refresh the page after installation. `setup.mjs` starts the `omchor-office` container at `127.0.0.1:3085` using a digest-pinned ONLYOFFICE Docs Community 9.4.0.1 image. It reuses an existing matching container and refuses to replace one with a different image. Install this bundle using the root README before opening an Office file.

The setup writes its private configuration to `$DSH_HOME/office/config.json`, or `~/.dsh/office/config.json` when `DSH_HOME` is unset, with mode `0600`. Keep its generated secret private. The editor requires the container to remain running; restart it with `node setup.mjs` if it stops.

The Cordis plugin accepts `configPath` to select another private configuration file. Deployment settings live in that file:

| Field | Setup value | Meaning |
|---|---|---|
| `editorOrigin` | `http://127.0.0.1:3085` | Local editor HTTP origin. |
| `bridgeHost` | Docker bridge gateway | Private listener address. |
| `secret` | Generated | Shared JWT signing secret. |
| `maxFileBytes` | `67108864` | Maximum source or saved document size. |
| `maxSessions` | `32` | Maximum active editor sessions. |

### Save behavior

The editor's own Save action can also write the file and update the last local-save time, but it does not clear Omchor's pending-change warning. **Save locally** confirms the requested edits; any newer edits remain pending. Closing the final editor tab can also trigger a delayed save.

Each editing session's first changed save retains the original bytes in a hidden sibling backup. Saves compare the current file digest and filesystem version before an atomic binary write through `ctx.fs`; workspace permissions and sandbox restrictions still apply. A detected external change refuses the save instead of replacing another writer's content. Keep the editor open when saving fails and resolve the reported problem before retrying.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin claims supported files as an Office tab and selects the editor's `theme-white` theme. Authenticated same-origin `/office` requests proxy the editor assets and connections to the local container. A private listener on the Docker bridge gateway uses an assigned port for source downloads and save callbacks; signed JWTs authorize those requests.

After the editor sends pending edits, **Save locally** posts `{id, revision}` to `/api/office.save`. The host carries the unique revision nonce in the force-save command's `userdata`; a signed callback returns it. After committing the file, `/api/office.status` exposes that nonce as `savedRevision`. Only a matching revision with an unchanged client edit generation clears pending changes and confirms the current draft. Native Save and final-close callbacks still persist bytes, but their timestamps alone cannot confirm which client edits they contain.

The plugin omits `./invariant`: its routes and editor tab expose no independent service observations whose relationship needs a runtime assertion. The [decision note](../../../.agents/notes/implemented/feature/2026-09-22-local-office-editor.md) records the engine choice and verification requirements.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ONLYOFFICE Docker installation](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx): local server deployment.
- [ONLYOFFICE saving protocol](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/saving-file/): force-save and final-close behavior.
- [Office research plan](../../docs/dsh-office-documents.md): broader alternatives and excluded formats.

-----

<a id="model-experience"></a>
## Model Experience

This plugin adds no model tools, prompts, or model-visible session events. Editing is a user action in the file panel.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The local editor has these limits:

- Only `.docx`, `.xlsx`, and `.pptx` are supported. Legacy `.doc`, `.xls`, and `.ppt` files are not silently converted.
- Editing requires a writable local workspace and regular files without symbolic links. Files outside that workspace are refused.
- Complex OOXML features, fonts, and layouts can differ from Microsoft Office. Saving does not promise byte-perfect preservation of every feature.
- The tab registry has no close veto. Closing an editor tab relies on the delayed final-save callback; wait for **Saved to local file** after **Save locally** when confirmation matters.
- The Docker bridge integration targets a local Linux host; a remote Docker engine or Docker Desktop needs different networking.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
