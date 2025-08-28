# TanStack Router Charset Encoding Issue

## Summary

This document summarizes the charset encoding issue discovered in TanStack Router where the dehydration script appears before the charset meta tag in server-rendered HTML, potentially causing encoding problems with non-ASCII characters.

## The Problem

In TanStack Router's server-side rendering with dehydration, the generated HTML has this structure:

```html
<head>
  <script class='$tsr'>
    <!-- Dehydration script with potential non-ASCII characters -->
    $_TSR["router"] = ... {greeting:"Ahoj světe! 你好世界 🌍"} ...
  </script>
  <meta charSet="utf-8"/>  <!-- Charset comes AFTER the script -->
  <!-- other head elements -->
</head>
```

## Why This Is Problematic

1. **HTML5 Specification**: The charset declaration should appear within the first 1024 bytes of the document and before any content that requires specific encoding interpretation.

2. **Browser Parsing**: Browsers start parsing script content immediately upon encountering it. If the charset hasn't been declared yet, they may:
   - Use a default encoding (often ISO-8859-1 or Windows-1252)
   - Misinterpret non-ASCII characters
   - Display garbled text or cause parsing errors

3. **Real-world Impact**: When route loader data contains non-ASCII characters (like Czech, Chinese, emoji, etc.), these get serialized into the dehydration script and may be corrupted.

## Reproduction

The issue can be reproduced by:

1. Creating a TanStack Start project with prerendering enabled
2. Adding loader data with non-ASCII characters
3. Building the project and examining the generated HTML

Example from our test case:
- TSR script position: 37 (characters from start)
- Charset meta position: 947 (characters from start)
- Non-ASCII characters found: ě, 你, 好, 世, 界, á, í, ó, etc.

## Root Cause

The issue stems from the stream transformation logic in `packages/router-core/src/ssr/transformStreamWithRouter.ts`:

```typescript
if (!headStarted) {
  const headStartMatch = chunkString.match(patternHeadStart)
  if (headStartMatch) {
    headStarted = true
    // ...
    finalPassThrough.write(
      chunkString.slice(0, index) + headTag + getBufferedRouterStream(), // Scripts injected immediately after <head>
    )
  }
}
```

The router injects its dehydration scripts immediately after the `<head>` tag, before the React component tree renders the meta tags.

## Potential Solutions

### Option 1: Modify Stream Transformation
Update the stream transformation logic to:
- Detect charset meta tags in the stream
- Buffer TSR scripts until after charset is encountered
- Only inject scripts after charset declaration

### Option 2: HeadContent Component Priority
Modify the `HeadContent` component to:
- Always render charset meta tag first
- Ensure it comes before any injected scripts

### Option 3: Head Content Ordering
Update the head content generation to:
- Parse existing head content
- Reorder elements to put charset first
- Maintain proper precedence

## Test Case

A comprehensive test has been created at:
- `router/e2e/react-start/basic/tests/charset-encoding.spec.ts`
- `router/tanstack-start-repro/charset-encoding-test.js`

The test documents the current (incorrect) behavior and will need to be updated once the issue is fixed.

## Expected Behavior

After the fix, the HTML should look like:

```html
<head>
  <meta charSet="utf-8"/>  <!-- Charset FIRST -->
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>...</title>
  <script class='$tsr'>
    <!-- Dehydration script comes after charset -->
  </script>
  <!-- other elements -->
</head>
```

## Impact

This issue affects any TanStack Start application that:
- Uses server-side rendering with dehydration
- Has route loader data containing non-ASCII characters
- Serves content to browsers that are strict about charset declaration ordering

The fix will ensure proper character encoding handling and compliance with HTML5 standards.
