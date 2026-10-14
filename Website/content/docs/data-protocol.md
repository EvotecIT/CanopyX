---
title: The canopyx/2 data protocol
order: 6
description: The JSON documents a host sends to the CanopyX runtime, each shown beside the grid it produces, from the view definition to lazy children pages and hosted endpoints.
layout: docs
meta.wide: true
---

The C# types write these documents and the browser runtime reads them. A host that is not .NET can write the same JSON by hand. Every top-level document carries `"protocol": "canopyx/2"` and a `type`; readers ignore fields they do not know, so a newer writer's document still loads. The complete field reference is the [protocol document in the repository](https://github.com/EvotecIT/CanopyX/blob/main/docs/data-protocol.md), with a JSON schema.

## A view and the tree it produces

`CanopyTreeView.ToJson()` writes a `view`: columns, behaviour, the data source and, for an inline source, the nodes. A cell is a bare value or an object with a `value` for sorting, a `text` to show and a `tone` the theme turns into a colour. Every string is inserted as text, never as HTML.

{{< cnx-example id="protocol-view" layout="split" caption="The document on the left is the one inside the page on the right. Collapse Projects or sort by Size: the runtime does it from this JSON alone." >}}

## A grid and the table it produces

Flat grids have their own `grid` document, without parents or a tree column. `CanopyDataGridView.ToJson()` writes it, and a host serves later windows of the same query as `gridPage` documents.

{{< cnx-example id="protocol-grid" layout="split" caption="A grid document beside the table it produces." >}}

## A page of children

When a lazy node opens, the data source answers with a `page` of its children. `offset` says where the page starts, `total` how many children there are, and `next` is an opaque continuation the runtime passes back for the next page; `null` ends the list.

{{< cnx-example id="protocol-page" caption="The C# that builds a children page, and the document it writes. Plans declares 12 children it has not sent yet, so it gets an expander and loads them on demand." >}}

## Hosted endpoints

A remote source names URL templates. The runtime fills the placeholders with URL-encoded values and sends `GET` requests; your application answers `children` with a `page`, `search` with a `search` document of id paths, and `counts` with a `counts` document.

{{< cnx-example id="protocol-source" caption="The source block of the hosted view from Delivery modes." >}}

A response with a failing status, invalid JSON, or the wrong `protocol` or `type` shows an error row with a retry action in place of the children. Authorization, page-size limits and query-time limits belong to the host's endpoints.

## Documents

{{< cnx-render id="documents" label="docs/data-protocol.md, Documents" caption="Every document type, read from the protocol reference during the build and drawn by the CanopyX static renderer." >}}
