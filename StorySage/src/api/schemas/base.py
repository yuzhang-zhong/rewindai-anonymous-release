from pydantic import BaseModel, ConfigDict

class StatusResponse(BaseModel):
    """Base response model for status messages"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "success",
                "message": "Operation completed successfully",
            }
        }
    )

    status: str
    message: str
