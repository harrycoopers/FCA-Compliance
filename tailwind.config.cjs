/** Keep complete utility names in templates/scripts so the production scan finds them. */
module.exports = {
  content: ['./views/**/*.ejs', './public/js/**/*.js', './server.js', './config/**/*.js', './data/**/*.js'],
  theme: { extend: {} },
  plugins: []
};
