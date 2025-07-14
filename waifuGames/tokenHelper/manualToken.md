# How to Get Your Discord Token Manually

Since Discord frequently changes their internal structure, the automatic token extraction may not always work. Here's how to get your token manually:

## Method 1: Network Tab (Recommended)

1. Open Discord Web (https://discord.com/app)
2. Press `F12` to open Developer Tools
3. Go to the **Network** tab
4. Press `Ctrl+R` (or `Cmd+R` on Mac) to refresh the page
5. In the filter box, type `api`
6. Click on any request to `discord.com/api/`
7. Look for the **Request Headers** section
8. Find the `Authorization` header
9. Copy the value (this is your token)

## Method 2: Console Method

1. Open Discord Web (https://discord.com/app)
2. Press `F12` to open Developer Tools
3. Go to the **Console** tab
4. Paste this code and press Enter:

```javascript
(function() {
  const token = (webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken).exports.default.getToken();
  console.log("Your token:", token);
  navigator.clipboard.writeText(token);
  console.log("Token copied to clipboard!");
})();
```

## Method 3: Application Tab

1. Open Discord Web (https://discord.com/app)
2. Press `F12` to open Developer Tools
3. Go to the **Application** tab (or **Storage** in Firefox)
4. In the left sidebar, expand **Local Storage**
5. Click on `https://discord.com`
6. Look for an entry that contains `token`
7. Copy the value (remove quotes if present)

## Security Warning

⚠️ **NEVER share your token with anyone!** Your token gives full access to your Discord account.

## Using the Token with Bot Manager

Once you have your token:

1. Create a new instance in your Bot Manager
2. Paste the token in the Token field
3. Enter your channel ID
4. Save the instance

The bot will now use your account to perform actions.