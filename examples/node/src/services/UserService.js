/**
 * Clean business service: User Management.
 * Zero telemetry or APM code.
 */
class UserService {
  async getUser(userId) {
    // Simulate database lookup latency
    await new Promise((resolve) => setTimeout(resolve, 15));
    return {
      userId,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      tier: 'premium',
    };
  }
}

module.exports = { UserService };
