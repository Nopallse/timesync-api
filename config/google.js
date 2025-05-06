const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');

passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.CALLBACK_URL,
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Try to find user in database
          let user = await User.findOne({ where: { googleId: profile.id } });
          
          if (!user) {
            // Create new user if not found
            user = await User.create({
              email: profile.emails[0].value,
              name: profile.displayName,
              photo: profile.photos?.[0]?.value,
              googleId: profile.id,
              accessToken,
              refreshToken,
            });
          } else {
            // Update tokens if user already exists
            await user.update({
              accessToken,
              refreshToken,
              photo: profile.photos?.[0]?.value,
            });
          }
          
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );