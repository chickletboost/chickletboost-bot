// services.js — Define your platforms, services, and packages here.
// No real service IDs exposed to users; internal IDs map to your panel.

const services = {
  instagram: {
    label: "📸 Instagram",
    services: {
      followers: {
        label: "👥 Followers",
        packages: [
          { label: "500 Followers",   price: "$2.99",  qty: 500,   apiServiceId: "101" },
          { label: "1,000 Followers", price: "$4.99",  qty: 1000,  apiServiceId: "102" },
          { label: "5,000 Followers", price: "$19.99", qty: 5000,  apiServiceId: "103" },
          { label: "10,000 Followers",price: "$34.99", qty: 10000, apiServiceId: "104" },
        ],
      },
      likes: {
        label: "❤️ Likes",
        packages: [
          { label: "1,000 Likes",  price: "$1.99",  qty: 1000,  apiServiceId: "201" },
          { label: "5,000 Likes",  price: "$7.99",  qty: 5000,  apiServiceId: "202" },
          { label: "10,000 Likes", price: "$13.99", qty: 10000, apiServiceId: "203" },
        ],
      },
      views: {
        label: "👁️ Views",
        packages: [
          { label: "10,000 Views", price: "$1.49", qty: 10000, apiServiceId: "301" },
          { label: "50,000 Views", price: "$5.99", qty: 50000, apiServiceId: "302" },
          { label: "100,000 Views",price: "$9.99", qty: 100000,apiServiceId: "303" },
        ],
      },
    },
  },

  tiktok: {
    label: "🎵 TikTok",
    services: {
      followers: {
        label: "👥 Followers",
        packages: [
          { label: "500 Followers",   price: "$2.49",  qty: 500,   apiServiceId: "401" },
          { label: "1,000 Followers", price: "$4.49",  qty: 1000,  apiServiceId: "402" },
          { label: "5,000 Followers", price: "$17.99", qty: 5000,  apiServiceId: "403" },
        ],
      },
      likes: {
        label: "❤️ Likes",
        packages: [
          { label: "1,000 Likes",  price: "$1.49", qty: 1000,  apiServiceId: "501" },
          { label: "5,000 Likes",  price: "$5.99", qty: 5000,  apiServiceId: "502" },
          { label: "10,000 Likes", price: "$9.99", qty: 10000, apiServiceId: "503" },
        ],
      },
      views: {
        label: "👁️ Views",
        packages: [
          { label: "50,000 Views",  price: "$2.99", qty: 50000,  apiServiceId: "601" },
          { label: "200,000 Views", price: "$7.99", qty: 200000, apiServiceId: "602" },
          { label: "500,000 Views", price: "$14.99",qty: 500000, apiServiceId: "603" },
        ],
      },
    },
  },

  youtube: {
    label: "▶️ YouTube",
    services: {
      subscribers: {
        label: "🔔 Subscribers",
        packages: [
          { label: "500 Subscribers",   price: "$6.99",  qty: 500,   apiServiceId: "701" },
          { label: "1,000 Subscribers", price: "$12.99", qty: 1000,  apiServiceId: "702" },
          { label: "5,000 Subscribers", price: "$49.99", qty: 5000,  apiServiceId: "703" },
        ],
      },
      likes: {
        label: "👍 Likes",
        packages: [
          { label: "500 Likes",   price: "$2.99", qty: 500,  apiServiceId: "801" },
          { label: "1,000 Likes", price: "$4.99", qty: 1000, apiServiceId: "802" },
          { label: "5,000 Likes", price: "$19.99",qty: 5000, apiServiceId: "803" },
        ],
      },
      views: {
        label: "👁️ Views",
        packages: [
          { label: "10,000 Views",  price: "$3.99", qty: 10000,  apiServiceId: "901" },
          { label: "50,000 Views",  price: "$14.99",qty: 50000,  apiServiceId: "902" },
          { label: "100,000 Views", price: "$24.99",qty: 100000, apiServiceId: "903" },
        ],
      },
    },
  },
};

module.exports = services;
