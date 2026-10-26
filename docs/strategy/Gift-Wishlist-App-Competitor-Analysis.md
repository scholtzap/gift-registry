---
type: investigation
status: reference
priority: high
source: Gemini chat export
captured: 2026-10-26
title: Gift Wishlist App Competitor Analysis
---

# Gift Wishlist App Competitor Analysis

**Why this matters.** This is the origin transcript for Gift Circles: it is the only record of
*why* the product is shaped the way it is, and the architecture still obeys the decisions taken
here. It documents the market read (Giftster has blind "reserved" claims but no group payment;
PresentSphere is privacy-first but reservation-only; WishGiven is event-bound rather than
persistent; PocketWell and SplitCost handle the money but have no wishlist discovery), and it
records the two load-bearing decisions that follow: put the registry behind a **persistent,
gated web link with an allowlist** instead of a native app, because app-download friction kills
a group-gifting cold start; and keep **asymmetric state with a soft delete**, because the owner
removing an item must never destroy the friends' pooled-money ledger. It also flags the phone-
number enumeration and scraping risks, and names three open-source starting points
(cmintey/wishlist, Reggio-Digital/wishlist, secret-santa repos). Read this before changing the
claim model, the owner/friend projections, the join flow, or the deal-suggestion visibility
rule.

[https\://gemini.google.com/app/d0cef1e03123117b](https://gemini.google.com/app/d0cef1e03123117b)

*User prompt: So, I have an app idea where the person can load up the gifts that they want. Um, just like an indication or even a specific link of, hey, I want cycling shoes or I want a new helmet or I want this dress or I want this painting or mirror or whatever. Um, and then people they add their friends. Friends invite each other. You don't get to see on the other side who's viewing your wanted gifts and stuff. Um, but all the friends can see what it is that you want and they can form um, groups that volunteer to buy a specific thing. There's one buyer assigned and those friends all band together to buy this person what is usually more an expensive gift. This way it takes the awkwardness out of asking, hey, what do you want? Gives the person whose birthday or Christmas present it is the opportunity to influence what it is that they get. There's still an element of surprise and there's coordination between the friends so that um, they can see who's buying what and not buying two of the same thing or yeah, not knowing that they can band together to buy something. Does something like this already exist? If so, list those competitors, say how they differ from what my idea is, maybe what's better, what's worse. Um, and then let me know whether you think that's a good idea.*

Response: Your idea solves a very real pain point—gift anxiety and the awkwardness of money collection—but it is not entirely new. The core mechanics of "blind wishlists" where the recipient cannot see what has been purchased already exist, as do standalone group-payment apps. However, merging a persistent social network, blind surprises, and integrated group crowdfunding into one seamless flow is a distinct concept where your idea stands out.

## **Existing Competitors**

> * [**Giftster**](https://www.giftster.com/)**:** A major platform in the family and Secret Santa space.  
  * **How they differ:** Users create lists and share them with groups. When someone buys an item, they mark it as "purchased" or "reserved," which is completely hidden from the list maker to preserve the surprise.  
  * **What's better:** It has a massive established user base and a robust link-fetching tool to pull item details from any website.  
  * **What's worse:** It lacks native, built-in group payment splitting. Friends have to coordinate the money off-platform via text and Venmo.  
> * [**PresentSphere**](https://presentsphere.com/gift-wishlist-app)**:** A newer app built around highly private, invite-only "circles."  
  * **How they differ:** Focuses heavily on privacy. Strangers see nothing, and when the circle reserves a gift, the recipient remains completely blind.  
  * **What's better:** Exceptional focus on keeping lists off the public web and avoiding the noisy "social media" feel.  
  * **What's worse:** It acts strictly as a reservation system, offering no financial coordination or group-buying mechanics.  
> * [**WishGiven**](https://www.wishgiven.com/)**:** An event-focused registry where friends can claim items anonymously.  
  * **What's better:** Highly integrated with event RSVPs and invitations.  
  * **What's worse:** It is tied to specific events (like a birthday party or wedding) rather than operating as a persistent, everyday social network of friends.  
> * **Group Gifting Apps (e.g., [PocketWell](https://www.pocketwellapp.com/blog/group-gift-calculator-how-to-split-us), [SplitCost](https://www.splitcost.in/en/blog/how-to-split-a-group-gift-fairly)):**  
  * **How they differ:** These focus purely on the financial side—creating a money pool, calculating equal splits, and collecting funds so one person isn't left acting as the bank.  
  * **What's better:** They handle complex math and payment processing elegantly.  
  * **What's worse:** They do not have the "wishlist discovery" or surprise element built in. You already need to know what you are buying before you use them.

## **The Verdict: Is it a good idea?**

Yes, it is a very strong product concept, but it comes with distinct execution challenges.

**Your Unique Advantage:** You are bridging the gap between discovery and transaction. Right now, friends use platforms like Giftster to *discover* what someone wants, but then have to jump to WhatsApp and payment apps to coordinate the group purchase. Your idea brings the social coordination, the surprise preservation, and the financial splitting under one roof.

**The Challenges (What's worse about your approach):**

> 1. **The Cold Start Problem:** Getting an entire friend group to download a new app just to facilitate a gift is a massive friction point. Apps that do not require account creation for guests usually grow much faster.  
> 2. **Payment Compliance:** Once you facilitate group payments—holding money in escrow while friends chip in—you are dealing with payment processing fees (like Stripe Connect), KYC (Know Your Customer) regulations, and fraud prevention. The technical and legal overhead is vastly higher than simply running a text-based "reservation" list.

If you can build a frictionless, web-first version so friends don't have to download an app just to chip in \$20, and flawlessly handle the group-pay mechanics, you have a highly marketable product that solves the exact friction points of modern gifting.

**Sources**

> 1. [Giftster Group Wish List Maker Birthdays, Christmas, Secret Santa](https://www.giftster.com/)  
> 2. [Gift wishlist app for families and close friends \- PresentSphere](https://presentsphere.com/gift-wishlist-app)  
> 3. [WishGiven: Free Wishlist App & Gift Registry \| Add Gifts from Any](https://www.wishgiven.com/)  
> 4. [How to Split the Cost of a Group Gift Fairly \- PocketWell](https://www.pocketwellapp.com/blog/group-gift-calculator-how-to-split-us)

---

*User prompt: I was wondering whether we can't do a crossover between 3BO and Sidea where we can use the live link concept or share links to a type of registry where people can contribute and sign up so that it doesn't live inside of an app per se, but at a persistent web link. I guess it's open to the private internet, but trapped behind the allow us to log in. I don't know.*

Response: Applying the web-portal and allowlist architecture from 3BO to this group-gifting concept (assuming "Sidea" was a voice-to-text typo for "this idea") is exactly how you solve the app-download friction.

By pulling the concept out of a native app and putting it on the open—but gated—web, you remove the biggest barrier to entry for a group of friends who just want to chip in for a birthday.

Here is how the crossover mechanics would work:

> * **The Persistent Web Link:** Instead of searching an app store, the recipient shares a simple URL (e.g., \[gifts.domain.com/arno-birthday\](https\://gifts.domain.com/arno-birthday)) directly in their friends' WhatsApp group.  
> * **The Allowlist Gate:** Just like how fleet access is handled in 3BO via invited email addresses, the registry link is trapped behind an authentication wall. The list maker (or the friend organizing it) adds the emails or phone numbers of the allowed friends.  
> * **Frictionless Entry:** When a friend clicks the link, they don't create a username or password. They authenticate via a quick Google OAuth or a WhatsApp magic link—leveraging the WhatsApp integrations you are already familiar with. If their email or number is on the allowlist, they are in.  
> * **The Shared Stack:** You can deploy this as a responsive, mobile-optimized web app using the same AWS Amplify backend infrastructure you utilize for 3BO, keeping the development environment familiar and lightweight.

This "gated web portal" approach gives you the privacy of a closed social network without the massive friction of onboarding users into a standalone app ecosystem. It operates purely on utility: get in, see the gifts, fund the pool, and get out.

---

*User prompt: So, I'm not sure how people discover your profile. Perhaps it's linked to your WhatsApp username or number, which you can put things on the wish list. If people go into the site to search a number, they can see your wish list. Uh, what do you think about that? I mean, people would opt in to have that open to the public, and then their friends or whatever on-boarded to it. Um, as they check their number out, and then they can share that to other people, make them aware of it via a type of live link to that person's profile and wish list where they can contribute. And the friends then manage what they've bought, what they haven't, which marks it on the friend side, but not on the um, the person who's being gifted things side. So not the profile owner side. Um, profile owner could also eventually delete things, but friends will be able to see what's been bought in the past and all as well if the owner gets to do it.*

Response: This is an incredibly sharp architecture choice. You are leveraging two things people already have—a phone number and a social graph—rather than forcing them to build a new one from scratch.

Your concept of the **asymmetrical state** (where the owner deleting an item doesn't wipe it from the friends' shared view if they've already bought it) solves one of the biggest edge cases in shared registry design.

Here is a breakdown of why this works well, and a few critical security considerations you need to lock down.

## **Why This Architecture Wins**

> 1. **Zero-Friction Discovery:** Searching by phone number is the fastest way to find someone. You bypass the clunky "search by first name, last name, and state" method that traditional wedding registries use.  
> 2. **Organic Virality:** The "live link" creates a natural growth loop. When a group of friends clicks gifts.app/your-number on WhatsApp, they don't just fund your gift—they realize how easy the platform is and are prompted to create their own list.  
> 3. **The "Soft Delete" UX Save:** The owner deleting an item because they changed their mind, or bought it themselves, is a major pain point if friends have already started pooling money. By doing a "soft delete" at the database level—hiding it from the owner's active view but keeping it active in the friends' group ledger—you prevent orphaned funds and group confusion.

## **Critical Risks to Engineer Around**

While the UX is excellent, tying public registries to phone numbers opens up some serious privacy and scraping risks that you must mitigate.

> * **The Scraping Risk:** If anyone can type in a 10-digit number and see a wishlist, bot networks will simply iterate through every possible phone number combination to harvest names, phone numbers, and wishlists.  
  * *The Fix:* You must implement an **Opt-In Visibility Toggle** combined with a requirement that the *searcher* must also be a verified, logged-in user. You can also employ a contact-sync model (similar to Signal or WhatsApp) where the app only reveals wishlists for phone numbers that the searcher already has saved in their phone's contact book.  
> * **Verification:** You cannot allow someone to claim a phone number without verifying it. You will need to use OTP (One-Time Password) SMS or WhatsApp magic links (like those offered by [Sinch](https://sinch.com/blog/why-you-should-blend-verification-methods-for-your-mobile-app-or-website/)) to ensure a user actually owns the number they are creating a profile for.  
> * **The "I Bought It Myself" Edge Case:** If the profile owner deletes an item because they just went to the store and bought it themselves, but friends were already 50% of the way through funding it, the friends need to know.  
  * *The Fix:* When an owner deletes an item, trigger a prompt: *"Did you buy this yourself, or do you just not want it anymore?"* If they bought it themselves, ping the friends' group ledger so they know to pivot their pooled money to a different gift.

The crossover between 3BO's authenticated allowlist architecture and a social gifting registry is highly viable. You are essentially building a private, secure overlay on top of the open web.

---

*User prompt: Are there any good starting point open source apps for this app idea*

Response: Yes, there are a few solid open-source projects on GitHub that you can fork to jumpstart this idea instead of building from scratch. They handle the core "wishlist claim" mechanics, meaning you'd primarily need to build the group-funding layer and the phone-number discovery system on top.

Here are the best starting points:

### **1\. cmintey/wishlist (The Best Overall Foundation)**

This is currently the most active and robust self-hosted wishlist app on GitHub.

> * **Tech Stack:** It's built with modern web technologies (often Node.js/Next.js and SQLite, though the repo packages it neatly into a Docker container).  
> * **Why it's a great starting point:** It already handles the exact "blind claim" logic you want. Users can create lists, and friends can claim items or mark them as purchased without the list owner seeing it. It also features automatic product data fetching from URLs and supports OAuth authentication, which aligns perfectly with your magic-link/Google login concept.  
> * **What you'd need to add:** The group-funding ledger (payment splitting) and the public-facing phone number lookup mechanism.

### **2\. Reggio-Digital/wishlist**

A simpler, lightweight alternative to cmintey/wishlist.

> * **Tech Stack:** Node.js with SQLite, easily deployable via Docker.  
> * **Why it's a great starting point:** It heavily focuses on a "no signups required" sharing model. You generate a single URL to share, and people can claim items transparently (seeing what others claimed to avoid duplicates) while keeping the admin/owner blind to the claims.  
> * **What you'd need to add:** This is very minimal, so you would need to build out the payment tracking and the SMS/WhatsApp verification layers.

### **3\. "Secret Santa" Algorithms (e.g., cloakedninjas/secret-santa)**

If you decide to pivot into event-based gifting, there are dozens of Express-based Secret Santa apps.

> * **Why it's useful:** While not a registry, these repos (like cloakedninjas or ahnafyy/secret-santa) contain the logic for sending SMS text notifications and handling complex user constraints (e.g., "Person A cannot buy for Person B"). You could lift their Twilio/Textbelt SMS integrations for your phone-number verification and notifications.

### **Recommendation on How to Proceed**

Since you are already comfortable with AWS Amplify, deploying Docker containers on GCP/Oracle (from your past personal portfolio work), and integrating headless databases like you did with Notion, I highly recommend starting by forking **cmintey/wishlist**.

You can spin up their Docker container on your existing Oracle ARM instance to test the UX. From there, you can strip out their email invite system and replace it with your WhatsApp/Phone-number auth flow using AWS Amplify or a tool like Clerk.

---
