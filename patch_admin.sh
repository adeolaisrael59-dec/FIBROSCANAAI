sed -i 's/    });/    }, (err) => console.error("onSnapshot error:", err));/g' src/components/SystemAdminDashboard.tsx
