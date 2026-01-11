from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Depends

from core.security import UserContext, get_current_user, _verify_token, _build_user_context


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/verify")
def verify_token(id_token: str = Body(..., embed=True)) -> UserContext:
    decoded = _verify_token(id_token)
    return _build_user_context(decoded)


@router.get("/me")
def auth_me(current_user: UserContext = Depends(get_current_user)) -> UserContext:
    return current_user
