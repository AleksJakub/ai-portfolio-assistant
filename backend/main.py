from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import UploadFile, File, Form
from pydantic import BaseModel
import pandas as pd
import openai
import os
from dotenv import load_dotenv
import json
from pydantic import BaseModel
import yfinance as yf

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RiskProfileInput(BaseModel):
    answers: dict

class PortfolioRequest(BaseModel):
    risk_profile: str

class FollowUpQuestion(BaseModel):
    question: str
    portfolio: dict
    risk_profile: str

class InvestmentRequest(BaseModel):
    risk_profile: str
    portfolio: dict

    
class PortfolioAnalysisRequest(BaseModel):
    text: str
    risk_profile: str


@app.post("/calculate-risk", response_class=JSONResponse)
def calculate_risk(data: RiskProfileInput):
    user_answers = "\n".join([f"{q}: {a}" for q, a in data.answers.items()])

    prompt = f"""
    Analyze these user responses and assign one of these risk profiles:
    Conservative, Moderate, Growth-Oriented, Aggressive, Very Aggressive

    (try and reserve Very Aggressive for only extremely aggressive portfolios, otherwise just go with aggressive)

    Also explain your reasoning based on the answers.

    User responses:
    {user_answers}

    Return a valid JSON response like:
    {{
    "final_risk_profile": "Moderate",
    "rationale": "Explanation here that references the user's inputs and justifies the risk level."
    }}
    """

    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        ai_response = response.choices[0].message.content
        print("/calculate-risk response:", ai_response)
        return json.loads(ai_response)
    except Exception as e:
        print("Error in /calculate-risk:", e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/suggest-portfolio", response_class=JSONResponse)
def suggest_portfolio(data: PortfolioRequest):
    prompt = f"""
    Suggest a detailed portfolio for a user with a {data.risk_profile} risk profile.

    Keep in mind that there are 5 risk profiles with these as the optimal results, however take into account market conditions: 
    Conservative - Bonds 65%, Cash 20%, Stocks 15%,
    Moderate - Stocks 50%, Bonds 40%, Cash 5%, Commodities 5%,
    Growth-Oriented - Stocks 65%, Bonds 20%, Cash 5%, Commodities 10%,
    Aggressive - Stocks 75%, Bonds 10%, Cash 5%, Commodities 10%,
    Very Aggressive - Stocks 85%, Crypto 5%, Bonds 5%, Cash 5%,
    
    Format JSON like:
    {{
        "portfolio": {{
            "Stocks": "50% - explanation",
            "Bonds": "30% - explanation",
            "Real Estate": "10% - explanation",
            "Commodities": "5% - explanation",
            "Cash": "5% - explanation"
        }},
        "rationale": "Why this allocation is right for the user."
    }}
    """

    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Return JSON only."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        ai_response = response.choices[0].message.content
        print("/suggest-portfolio response:", ai_response)
        return json.loads(ai_response)
    except Exception as e:
        print("Error in /suggest-portfolio:", e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/portfolio-followup", response_class=JSONResponse)
def portfolio_followup(data: FollowUpQuestion):
    prompt = f"""
    You are an expert financial advisor.

    The client was given this portfolio:
    {json.dumps(data.portfolio, indent=2)}

    They ask:
    "{data.question}"

    Answer clearly and helpfully.
    """
    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an AI advisor. Be clear, concise, and professional."},
                {"role": "user", "content": prompt},
            ]
        )
        ai_response = response.choices[0].message.content.strip()
        print("/portfolio-followup response:", ai_response)
        return {"answer": ai_response}
    except Exception as e:
        print("Error in /portfolio-followup:", e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/suggest-investments", response_class=JSONResponse)
def suggest_investments(data: InvestmentRequest):
    import yfinance as yf

    candidates = {
        "Stocks": [
            "VTI",
            "SPY", 
            "VOO",
            "IVV",  
            "QQQ",  
            "IWM",  
            "DIA",  
            "ARKK", 
            "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"
        ],
        "Bonds": [
            "BND",  
            "AGG",  
            "TLT",  
            "IEF",  
            "SHY",  
            "LQD",  
        ],
        "Real Estate": [
            "VNQ",  
            "IYR",  
            "SCHH",
            "XLRE"  
        ],
        "Commodities": [
            "GLD",  
            "SLV",  
            "DBC",  
            "USO",  
            "PPLT",
            "CPER",
            "DBA"  
        ],
        "Cash": [
            "SHV",   
            "VMFXX",
            "BIL",   
            "SGOV"   
        ],
        "Crypto": [
            "GBTC",  
            "BITO",   
            "ETHE"   
        ]
    }

    asset_data = {}

    for category, tickers in candidates.items():
        asset_data[category] = []
        for t in tickers:
            try:
                info = yf.Ticker(t).info
                asset_data[category].append({
                    "symbol": t,
                    "name": info.get("shortName", t),
                    "summary": info.get("longBusinessSummary", "No summary available."),
                    "sector": info.get("sector", "N/A")
                })
            except:
                asset_data[category].append({
                    "symbol": t,
                    "name": t,
                    "summary": "Unable to fetch data.",
                    "sector": "N/A"
                })

    asset_prompt_parts = []
    for category, items in asset_data.items():
        asset_prompt_parts.append(f"**{category} options:**")
        for asset in items:
            asset_prompt_parts.append(
                f"{asset['name']} ({asset['symbol']}): {asset['summary'][:200]}..."
            )

    full_asset_prompt = "\n".join(asset_prompt_parts)

    prompt = f"""
    You are a financial advisor AI. The user has a {data.risk_profile} risk profile.
    Here is their portfolio allocation:

    {json.dumps(data.portfolio, indent=2)}

    Below is a list of real investments with summaries:

    {full_asset_prompt}

    For each category in the portfolio, choose 2 suitable investments from the list above.
    Justify why each is a good fit based on their summary and the user's risk profile.

    Return JSON like this:
    {{
    "investments": {{
        "Stocks (30%)": [
        {{"name": "VTI", "symbol": "VTI", "description": "Well-diversified U.S. stock exposure."}},
        ...
        ],
        ...
    }}
    }}
    """

    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a professional financial AI. Return JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        ai_response = response.choices[0].message.content
        return json.loads(ai_response)

    except Exception as e:
        return {"error": f"Error combining GPT and yfinance: {str(e)}"}

    
@app.post("/general-investment-qa")
def general_investment_qa(data: dict):
    question = data.get("question", "")
    risk_profile = data.get("risk_profile", "Balanced")

    prompt = f"""
    You are a financial advisor helping a user with a {risk_profile} risk profile.
    They asked: "{question}"

    Provide a clear, concise, and professional answer suitable for their risk profile.
    """

    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert financial advisor."},
                {"role": "user", "content": prompt},
            ]
        )
        answer = response.choices[0].message.content.strip()
        return {"answer": answer}
    except Exception as e:
        print("Error in /general-investment-qa:", e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/analyze-portfolio")
def analyze_portfolio(data: PortfolioAnalysisRequest):
    prompt = f"""
    A user with a {data.risk_profile} risk profile provided this portfolio:

    "{data.text}"

    Analyze the portfolio and suggest a more suitable allocation or improvements.
    Provide:
    - A revised allocation (e.g., "Stocks: 40% - explanation")
    - A rationale

    Format your response in JSON:
    {{
      "optimized_portfolio": {{
        "Stocks": "40% - explanation",
        "Bonds": "30% - explanation",
        "Crypto": "10% - explanation",
        "Cash": "20% - explanation"
      }},
      "rationale": "Why these changes were made."
    }}
    """

    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a portfolio optimization assistant. Return only JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print("Error in /analyze-portfolio:", e)
        return {"error": str(e)}
    
    
@app.post("/analyze-portfolio-file", response_class=JSONResponse)
async def analyze_portfolio_file(file: UploadFile = File(...), risk_profile: str = Form(...)):
    try:
        filename = file.filename.lower()
        content = await file.read()
        if filename.endswith(".xlsx"):
            from io import BytesIO
            df = pd.read_excel(BytesIO(content))
            text = df.to_string(index=False)
        else:
            text = content.decode("utf-8")

        prompt = f"""
        You are an expert financial advisor.

        A user with a {risk_profile} risk profile uploaded their portfolio file with this content:

        {text}

        Based on this, suggest a better allocation and explain your reasoning.

        Respond in JSON:
        {{
          "optimized_portfolio": {{
            "Stocks": "40% - explanation",
            "Bonds": "30% - explanation",
            ...
          }},
          "changes to previous allocation": "show the differences between user's allocation and the new one"
          "rationale": "Why this new allocation is better"
        }}
        """

        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"error": f"Error analyzing uploaded file: {str(e)}"}
    

@app.post("/adjust-portfolio", response_class=JSONResponse)

def adjust_portfolio(data: FollowUpQuestion):
    prompt = f"""
    You are a backend service for adjusting a user's investment portfolio.

    Risk Profile: {data.risk_profile}

    Current Portfolio:
    {json.dumps(data.portfolio, indent=2)}

    User Request:
    "{data.question}"

    Your job is to return an updated portfolio, even if the request seems risky. DO NOT reject the request — instead, accommodate it with a warning if needed.

    Only return valid JSON in this format:
    {{
    "adjusted_portfolio": {{
        "Stocks": "percentage - explanation",
        "Bonds": "percentage - explanation",
        "Crypto": "percentage - explanation (if included)",
        ...
    }},
    "explanation": "What changed and why.",
    "risk_warning": "Warn if risk profile exceeded. Otherwise say 'No risk concerns.'"
    }}

    You must modify the portfolio percentages so they sum to 100%.
    No text or markdown outside this JSON.
    """


    try:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a backend service. You must return only valid JSON. Do not include explanations or extra text. Just return the JSON response as instructed."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        ai_response = response.choices[0].message.content

        try:
            parsed = json.loads(ai_response)
            if "adjusted_portfolio" not in parsed or not isinstance(parsed["adjusted_portfolio"], dict):
                raise ValueError("Missing or invalid 'adjusted_portfolio'")
            return parsed
        except Exception as e:
            print("GPT failed to return valid JSON:", ai_response)
            return JSONResponse(
                content={
                    "error": "The assistant did not return a valid adjusted portfolio.",
                    "raw_response": ai_response
                },
                status_code=500
            )

    except Exception as e:
        print("Error in /adjust-portfolio:", e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/stock-info/{ticker}")
def get_stock_info(ticker: str):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        return {
            "symbol": ticker.upper(),
            "name": info.get("longName"),
            "price": info.get("regularMarketPrice"),
            "marketCap": info.get("marketCap"),
            "sector": info.get("sector"),
            "summary": info.get("longBusinessSummary"),
        }
    except Exception as e:
        return {"error": f"Failed to fetch stock data: {str(e)}"}