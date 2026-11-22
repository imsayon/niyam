function missing() {
  return Response.json({ error: "API endpoint not found." }, { status: 404 });
}
export { missing as GET, missing as POST, missing as PUT, missing as PATCH, missing as DELETE };
