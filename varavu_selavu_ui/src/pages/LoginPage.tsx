import React, { useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Box,
  Checkbox,
  FormControlLabel,
  Link,
  Divider,
  InputAdornment,
  Avatar,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import SavingsIcon from "@mui/icons-material/Savings";
import { keyframes } from "@mui/system";
import Grid from "@mui/material/Grid";
import { login } from "../api/login";
import { useNavigate } from "react-router-dom";

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(8px) }
  to   { opacity: 1; transform: translateY(0) }
`;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await login({ username: email, password });
      localStorage.setItem("vs_token", response.access_token);
      localStorage.setItem("vs_user", email);
      if (remember) localStorage.setItem("vs_remember", "1");
      window.dispatchEvent(new Event("vs_auth_changed"));
      navigate("/dashboard");
    } catch {
      setError("Invalid credentials or server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/*<AppBar position="static" color="primary" elevation={0}>*/}
      {/*  <Toolbar sx={{ gap: 1 }}>*/}
      {/*    <Avatar sx={{ bgcolor: "secondary.main", width: 28, height: 28 }}>*/}
      {/*      <SavingsIcon fontSize="small" />*/}
      {/*    </Avatar>*/}
      {/*    <Typography variant="h6" sx={{ fontWeight: 700 }}>*/}
      {/*      Varavu Selavu*/}
      {/*    </Typography>*/}
      {/*  </Toolbar>*/}
      {/*</AppBar>*/}

      <Box
        sx={{
          minHeight: "calc(100vh - 64px)",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        {/* Left section */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: { xs: 4, md: 6 },
            background:
              "linear-gradient(135deg, #4F46E5 0%, #14B8A6 100%)",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              width: 340,
              height: 340,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.10)",
              right: -80,
              top: -60,
              filter: "blur(16px)",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              width: 260,
              height: 260,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.08)",
              left: -60,
              bottom: -40,
              filter: "blur(10px)",
            }}
          />
          <Box sx={{ maxWidth: 420, textAlign: { xs: "center", md: "left" } }}>
            <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              Track, analyze & plan your spending
            </Typography>
            <Typography sx={{ mt: 2, opacity: 0.9 }}>
              A clear, friendly dashboard for your daily expenses and long-term
              goals. Secure, private, and fast.
            </Typography>
          </Box>
        </Box>

        {/* Right login card */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: { xs: 3, md: 6 },
            bgcolor: "background.default",
          }}
        >
          <Card
            elevation={6}
            sx={{
              width: 420,
              maxWidth: "100%",
              borderRadius: 3,
              animation: `${fadeInUp} .35s ease-out`,
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ textAlign: "center", mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  Login
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Welcome back! Sign in to continue.
                </Typography>
              </Box>

              <Button
                variant="outlined"
                fullWidth
                startIcon={<GoogleIcon />}
                sx={{ textTransform: "none", mb: 2, borderRadius: 2 }}
                disabled
              >
                Continue with Google (coming soon)
              </Button>

              <Divider sx={{ mb: 2 }}>or</Divider>

              <Box component="form" onSubmit={handleLogin} noValidate>
                <Grid container spacing={2}>
                  {error && (
                    <Grid size={12}>
                      <Typography color="error" align="center">
                        {error}
                      </Typography>
                    </Grid>
                  )}

                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>

                  <Grid size={12}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                        />
                      }
                      label="Remember me"
                    />
                  </Grid>

                  <Grid size={12}>
                    <Button
                      type="submit"
                      variant="contained"
                      fullWidth
                      disabled={loading}
                      sx={{
                        py: 1.2,
                        borderRadius: 2,
                        fontWeight: 700,
                        boxShadow: "0 8px 18px rgba(79,70,229,.25)",
                        ":hover": {
                          boxShadow: "0 10px 24px rgba(79,70,229,.35)",
                        },
                      }}
                    >
                      {loading ? "Logging in..." : "Login"}
                    </Button>
                  </Grid>

                  <Grid
                    size={12}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mt: 1,
                    }}
                  >
                    <Link href="#" variant="body2" underline="hover">
                      Create account
                    </Link>
                    <Link href="#" variant="body2" underline="hover">
                      Forgot password?
                    </Link>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </>
  );
};

export default LoginPage;